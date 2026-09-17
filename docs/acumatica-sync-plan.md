# Acumatica ⇄ WooCommerce Sync — Plan of Record

Status: **INVENTORY SYNC BUILT (pending live-verify + WPE deploy); shipment writeback still deferred.** Last updated 2026-09-17.

## As-built (inventory-only) — 2026-09-17
Code: `migration/wp/mu-plugins/mellow-fellow-acumatica-inventory.php` (new) + edits to
`mellow-fellow-acumatica-orders.php`. Not yet committed/deployed (commit only when asked).
- **Sellable stock = SUM(QtyAvailable) over MFNC+MFFL+MFTN only** (AB excluded), clamp ≥0.
  Const `MF_ACU_SELLABLE_WAREHOUSES`. Written as an absolute value; update-only; draft/published alike.
- **Price NOT synced** (Woo owns price). MSRP-to-GI change dropped.
- **Dynamic SO warehouse routing** (`mf_acu_route_warehouse`): prefer ACF `warehouse_code`;
  if empty there, route the SO line to the sellable warehouse with the most Available; else
  keep the ACF code. Availability for the whole order is fetched in ONE batched OData call.
- **Woo never changes stock**: `woocommerce_can_reduce_order_stock` +
  `woocommerce_can_restore_order_stock` → false. Only the sync writes stock.
- **Immediate re-sync**: ~60s after a successful push, one batched OData read of the order's
  SKUs writes current Available (reliable because it reads QtyAvailable directly — an SO
  allocation drops Available WITHOUT bumping LastModifiedOn, so an early delta would miss it).
- **15-min delta** (`mf_acu_inventory_sync`, watermark option `mf_acu_inventory_watermark`):
  pulls changed InventoryIDs since watermark, re-reads them in batched OData calls, writes stock.
- **All reads use the OData GI (basic auth, `mf_acu_odata_get`) — NEVER the contract-REST seat.**
- Live-verify at deploy: delta datetime literal syntax, one-row-per-warehouse shape,
  `ACUMATICA_ODATA_URL` config (default = BASE_URL + `/OData/ARVIDA`).

---
_Original plan (retained for reference):_

## Guiding principle
**Acumatica is the source of truth. WooCommerce is a read-only mirror** — it stores
price and stock only for display and the in-stock/add-to-cart gate. WooCommerce does
**not** manage inventory itself; the only thing that changes Woo stock is this sync.

The loop:
1. **Acumatica → Woo (this sync):** delta pull of price + **Available** inventory.
2. **Woo → Acumatica (order push — already built):** an order creates the Acumatica SO,
   which **allocates** inventory → **Available drops**.
3. Next delta run mirrors the new Available to Woo → **no overselling**.

## The two Generic Inquiries (CONFIRMED live via OData, 2026-09-17)
OData root: `https://arvidalabs-sandbox.acumatica.com/OData/ARVIDA/` (basic auth).
Both GIs are exposed and queryable:
- **`MF InventoryPricing API`** — price + inventory feed
- **`MF Shipments API`** — fulfillment/tracking feed

### `MF InventoryPricing API` — confirmed columns
`InventoryID`, `Description`, `DefaultPrice`, `ItemStatus`, `LastModifiedOn`,
`QtyAvailable`, `InventoryID_2`, `Subitem`, `Warehouse`.
- ✅ `LastModifiedOn` present → delta works.
- ✅ `QtyAvailable` present → the inventory number (Available, not On Hand).
- ⚠️ **NO `MSRP` column.** `DefaultPrice` is the **wholesale** price (verified:
  AB00000191 GI `DefaultPrice=9.50`, but retail/Woo regular = 29.99 = StockItem `MSRP`).
  **→ ACTION: add an `MSRP` column to this GI** so the sync can set `_regular_price`.
- ⚠️ Returns one row **per warehouse**; the warehouse shown can differ from the
  product's ACF `warehouse_code` (AB00000191: GI `Warehouse=MFTN` vs ACF `MFNC`).
  Sibling project used "default warehouse only." **→ CONFIRM: which warehouse's
  QtyAvailable drives Woo stock — the item's Acumatica default, or the ACF
  `warehouse_code`?** They should agree; reconcile before launch.

### `MF Shipments API` — confirmed columns
`OrderNbr`, `ShipmentNbr`, `CustomerOrderNbr`, `TrackingNumber`, `Description`,
`ShipmentDate`, `Status`, `OrderType`, `ShippingRefNoteID`, `LineNbr` (+ duplicate
`*_2/_3/_4` columns). Purpose: write shipment status + tracking back to the WC order.
- ✅ `CustomerOrderNbr` = the WooCommerce order number (e.g. 20239) — the join key.
- ⚠️ **NO `LastModifiedOn` column** → delta can't work yet. **→ ACTION: add
  `LastModifiedOn` sourced from the shipment record (`SOShipment.LastModifiedDateTime`),
  not the sales order** — so delta catches new shipments AND later edits (tracking#
  added, status→Completed), which `ShipmentDate` can't.
- ⚠️ **Order-line-centric** (ShipmentNbr null on unshipped lines → ~51k mostly-null
  rows). **→ ACTION: make it shipment-centric** (filter `ShipmentNbr ne null`).
- ⚠️ **Stable key** for idempotent upserts: `ShipmentNbr` + `LineNbr` (or the
  `ShippingRefNoteID` GUID). Clean up the duplicate `*_2/_3/_4` columns.

## Shared delta engine
One engine for both feeds: **high-watermark on `LastModifiedOn`** — store the max seen,
next run query `LastModifiedOn gt <watermark>`, upsert, advance. Catches new + edited.

## Field map (final)
| Acumatica (MF InventoryPricing API) | WooCommerce | Notes |
|---|---|---|
| `InventoryID` | SKU | match key (no variations — every item has its own SKU) |
| `MSRP` *(to be added to GI)* | `_regular_price` | retail; `DefaultPrice` is wholesale — DO NOT use |
| `QtyAvailable` (correct warehouse) | stock qty | Available not On Hand; clamp negative → 0 / out-of-stock |
| — | `_sale_price` | **leave untouched** — Woo/marketing-owned |

Fulfillment warehouse routing is already built on the **order push**: SO line
`WarehouseID` from the product's ACF `warehouse_code` (MFNC / MFFL / AB).

## Confirmed decisions
- **Update-only** — the sync only updates existing Woo products; it does NOT create new ones.
- **No variations** — every product has its own SKU; match on SKU directly.
- **Cadence** — every **15 minutes** (Action Scheduler, delta-filtered so each run is light).

## WooCommerce must not touch inventory (Acumatica = source of truth)
- **Disable WC stock reduction on order:** `add_filter('woocommerce_can_reduce_order_stock','__return_false')`
  so placing/paying an order never decrements Woo stock — only the sync writes it.
- Keep `manage_stock = yes` per product (for the in-stock gate + display), but the
  **quantity is only ever set by the sync** (absolute value from Acumatica Available,
  not increment/decrement → idempotent and authoritative).
- Verify no other plugin decrements: Bundle Builder, Subscriptions renewals, manual
  admin edits. The order push already sends stock changes to Acumatica; Woo just mirrors back.
- Optional: turn off WC "hold stock" and low-stock/out-of-stock emails (noise, since
  Acumatica owns stock).

## Acumatica-side changes required BEFORE building
1. **Add `MSRP`** to `MF InventoryPricing API` (retail regular price).
2. **Add `LastModifiedOn`** (from `SOShipment.LastModifiedDateTime`) to `MF Shipments API`;
   make it shipment-centric; ensure a stable key (ShipmentNbr+LineNbr / ShippingRefNoteID).
3. **Confirm** which warehouse's `QtyAvailable` is authoritative for Woo stock.

## Resolved / done
- ✅ Both GI names confirmed live via OData: `MF InventoryPricing API`, `MF Shipments API`.
- ✅ Regular price source = Acumatica **MSRP** (not DefaultPrice/wholesale) — needs adding to the GI.
- ✅ Fulfillment warehouse routing = ACF `warehouse_code` → SO line `WarehouseID` (built, live).
- ✅ Order push (Woo→Acumatica) with duplicate-prevention + free-gift note (built, live).
