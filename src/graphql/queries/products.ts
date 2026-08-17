import { gql } from '@apollo/client';

// The `productDetails` ACF group is shared by every product type, so it lives in
// its own fragment rather than being repeated per product-type fragment.
export const PRODUCT_DETAILS_FIELDS = gql`
  fragment ProductDetailsFields on ProductDetails {
    noidOrBlendDescriptionTitle
    whatIsNoid
    directionsForUse
    deviceSpecifications
    ingredientsV2
    servingSize
    disclaimers
    coaLink
    timelineImage {
      node {
        sourceUrl
        altText
        mediaDetails {
          width
          height
        }
      }
    }
    deviceFaqsReference {
      nodes {
        id
        ... on FAQ {
          title
          content
        }
      }
    }
  }
`;

// The `Nutrition` ACF group is attached directly to products (not nested
// under productDetails), and is likewise shared across all four product
// types.
export const NUTRITION_FIELDS = gql`
  fragment NutritionFields on Nutrition {
    calories
    sugar
  }
`;

// WooGraphQL returns products as a union type, so we need inline fragments for each type
export const SIMPLE_PRODUCT_FIELDS = gql`
  ${PRODUCT_DETAILS_FIELDS}
  ${NUTRITION_FIELDS}
  fragment SimpleProductFields on SimpleProduct {
    id
    databaseId
    name
    slug
    type
    description
    shortDescription
    sku
    price
    regularPrice
    salePrice
    stockStatus
    stockQuantity
    image {
      id
      sourceUrl
      altText
    }
    galleryImages {
      nodes {
        id
        sourceUrl
        altText
      }
    }
    productCategories {
      nodes {
        id
        name
        slug
      }
    }
    strainTypes {
      nodes {
        name
        slug
      }
    }
    strainNames {
      nodes {
        name
        slug
      }
    }
    flavors {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    vibes {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    feelings {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    settings {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    mellowMeters {
      nodes {
        id
        name
        slug
        mellowMeterFields {
          meterImage {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    blendTypes {
      nodes {
        name
        slug
      }
    }
    productLines {
      nodes {
        name
        slug
      }
    }
    size {
      nodes {
        name
        slug
      }
    }
    mfproductTypes {
      nodes {
        name
        slug
      }
    }
    cannabinoids {
      nodes {
        name
        slug
      }
    }
    singleCannabinoid {
      nodes {
        name
        slug
      }
    }
    mG {
      nodes {
        name
        slug
      }
    }
    pieces {
      nodes {
        name
        slug
      }
    }
    bbLinkedBundleId
    bbFromPrice
    uniqueSellingProps {
      nodes {
        id
        name
        uniqueSellingFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    productDetails {
      ...ProductDetailsFields
    }
    nutrition {
      ...NutritionFields
    }
    collections(first: 50) {
      nodes {
        name
        slug
        count
      }
    }
  }
`;

export const VARIABLE_PRODUCT_FIELDS = gql`
  ${PRODUCT_DETAILS_FIELDS}
  ${NUTRITION_FIELDS}
  fragment VariableProductFields on VariableProduct {
    id
    databaseId
    name
    slug
    type
    description
    shortDescription
    sku
    price
    regularPrice
    salePrice
    stockStatus
    stockQuantity
    productDetails {
      ...ProductDetailsFields
    }
    nutrition {
      ...NutritionFields
    }
    collections(first: 50) {
      nodes {
        name
        slug
        count
      }
    }
    image {
      id
      sourceUrl
      altText
    }
    galleryImages {
      nodes {
        id
        sourceUrl
        altText
      }
    }
    productCategories {
      nodes {
        id
        name
        slug
      }
    }
    variations {
      nodes {
        id
        databaseId
        name
        price
        regularPrice
        salePrice
        stockStatus
        attributes {
          nodes {
            name
            value
          }
        }
      }
    }
    strainTypes {
      nodes {
        name
        slug
      }
    }
    strainNames {
      nodes {
        name
        slug
      }
    }
    flavors {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    vibes {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    feelings {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    settings {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    mellowMeters {
      nodes {
        id
        name
        slug
        mellowMeterFields {
          meterImage {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    blendTypes {
      nodes {
        name
        slug
      }
    }
    productLines {
      nodes {
        name
        slug
      }
    }
    size {
      nodes {
        name
        slug
      }
    }
    mfproductTypes {
      nodes {
        name
        slug
      }
    }
    cannabinoids {
      nodes {
        name
        slug
      }
    }
    singleCannabinoid {
      nodes {
        name
        slug
      }
    }
    mG {
      nodes {
        name
        slug
      }
    }
    pieces {
      nodes {
        name
        slug
      }
    }
    bbLinkedBundleId
    bbFromPrice
    uniqueSellingProps {
      nodes {
        id
        name
        uniqueSellingFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;

export const EXTERNAL_PRODUCT_FIELDS = gql`
  ${NUTRITION_FIELDS}
  fragment ExternalProductFields on ExternalProduct {
    id
    databaseId
    name
    slug
    type
    description
    shortDescription
    sku
    price
    regularPrice
    salePrice
    externalUrl
    buttonText
    nutrition {
      ...NutritionFields
    }
    image {
      id
      sourceUrl
      altText
    }
    galleryImages {
      nodes {
        id
        sourceUrl
        altText
      }
    }
    productCategories {
      nodes {
        id
        name
        slug
      }
    }
    strainTypes {
      nodes {
        name
        slug
      }
    }
    strainNames {
      nodes {
        name
        slug
      }
    }
    flavors {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    vibes {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    feelings {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    settings {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    mellowMeters {
      nodes {
        id
        name
        slug
        mellowMeterFields {
          meterImage {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    blendTypes {
      nodes {
        name
        slug
      }
    }
    productLines {
      nodes {
        name
        slug
      }
    }
    size {
      nodes {
        name
        slug
      }
    }
    mfproductTypes {
      nodes {
        name
        slug
      }
    }
    cannabinoids {
      nodes {
        name
        slug
      }
    }
    singleCannabinoid {
      nodes {
        name
        slug
      }
    }
    mG {
      nodes {
        name
        slug
      }
    }
    pieces {
      nodes {
        name
        slug
      }
    }
    bbLinkedBundleId
    bbFromPrice
    uniqueSellingProps {
      nodes {
        id
        name
        uniqueSellingFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;

export const GROUP_PRODUCT_FIELDS = gql`
  ${NUTRITION_FIELDS}
  fragment GroupProductFields on GroupProduct {
    id
    databaseId
    name
    slug
    type
    description
    shortDescription
    sku
    price
    nutrition {
      ...NutritionFields
    }
    image {
      id
      sourceUrl
      altText
    }
    galleryImages {
      nodes {
        id
        sourceUrl
        altText
      }
    }
    productCategories {
      nodes {
        id
        name
        slug
      }
    }
    strainTypes {
      nodes {
        name
        slug
      }
    }
    strainNames {
      nodes {
        name
        slug
      }
    }
    flavors {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    vibes {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    feelings {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    settings {
      nodes {
        id
        name
        slug
        extraTaxonomyFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    mellowMeters {
      nodes {
        id
        name
        slug
        mellowMeterFields {
          meterImage {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
    blendTypes {
      nodes {
        name
        slug
      }
    }
    productLines {
      nodes {
        name
        slug
      }
    }
    size {
      nodes {
        name
        slug
      }
    }
    mfproductTypes {
      nodes {
        name
        slug
      }
    }
    cannabinoids {
      nodes {
        name
        slug
      }
    }
    singleCannabinoid {
      nodes {
        name
        slug
      }
    }
    mG {
      nodes {
        name
        slug
      }
    }
    pieces {
      nodes {
        name
        slug
      }
    }
    bbLinkedBundleId
    bbFromPrice
    uniqueSellingProps {
      nodes {
        id
        name
        uniqueSellingFields {
          propIcon {
            node {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;

export const GET_PRODUCTS = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetProducts(
    $first: Int = 12
    $after: String
    $search: String
    $orderby: [ProductsOrderbyInput]
    $mfProductType: String
    $mfProductTypeIn: [String]
    $strainTypeFilter: String
    $strainTypeFilterIn: [String]
    $blendTypeFilter: String
    $blendTypeFilterIn: [String]
    $cannabinoidFilter: String
    $cannabinoidFilterIn: [String]
    $singleCannabinoidFilter: String
    $singleCannabinoidFilterIn: [String]
    $sizeFilter: String
    $sizeFilterIn: [String]
    $mgFilter: String
    $mgFilterIn: [String]
    $piecesFilter: String
    $piecesFilterIn: [String]
    $collectionFilter: String
    $collectionFilterIn: [String]
    $minPrice: Float
    $maxPrice: Float
  ) {
    products(first: $first, after: $after, where: {
      status: "publish"
      search: $search
      orderby: $orderby
      mfProductType: $mfProductType
      mfProductTypeIn: $mfProductTypeIn
      strainTypeFilter: $strainTypeFilter
      strainTypeFilterIn: $strainTypeFilterIn
      blendTypeFilter: $blendTypeFilter
      blendTypeFilterIn: $blendTypeFilterIn
      cannabinoidFilter: $cannabinoidFilter
      cannabinoidFilterIn: $cannabinoidFilterIn
      singleCannabinoidFilter: $singleCannabinoidFilter
      singleCannabinoidFilterIn: $singleCannabinoidFilterIn
      sizeFilter: $sizeFilter
      sizeFilterIn: $sizeFilterIn
      mgFilter: $mgFilter
      mgFilterIn: $mgFilterIn
      piecesFilter: $piecesFilter
      piecesFilterIn: $piecesFilterIn
      collectionFilter: $collectionFilter
      collectionFilterIn: $collectionFilterIn
      minPrice: $minPrice
      maxPrice: $maxPrice
    }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on SimpleProduct {
          ...SimpleProductFields
        }
        ... on VariableProduct {
          ...VariableProductFields
        }
        ... on ExternalProduct {
          ...ExternalProductFields
        }
        ... on GroupProduct {
          ...GroupProductFields
        }
      }
    }
  }
`;

export const GET_PRODUCT_BY_SLUG = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetProductBySlug($slug: ID!) {
    product(id: $slug, idType: SLUG) {
      __typename
      shopifyId
      seo {
        title
        metaDesc
        schema {
          raw
        }
        opengraphTitle
        opengraphDescription
        opengraphImage {
          sourceUrl
        }
      }
      ... on SimpleProduct {
        ...SimpleProductFields
      }
      ... on VariableProduct {
        ...VariableProductFields
      }
      ... on ExternalProduct {
        ...ExternalProductFields
      }
      ... on GroupProduct {
        ...GroupProductFields
      }
    }
  }
`;

/**
 * Same selection as GET_PRODUCT_BY_SLUG but keyed by database ID — the shape
 * Faust's `single-product` template needs, since the seed node resolved from the
 * URI gives us a `databaseId` rather than a slug.
 */
export const GET_PRODUCT_BY_DATABASE_ID = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetProductByDatabaseId($databaseId: ID!) {
    product(id: $databaseId, idType: DATABASE_ID) {
      __typename
      shopifyId
      seo {
        title
        metaDesc
        schema {
          raw
        }
        opengraphTitle
        opengraphDescription
        opengraphImage {
          sourceUrl
        }
      }
      ... on SimpleProduct {
        ...SimpleProductFields
      }
      ... on VariableProduct {
        ...VariableProductFields
      }
      ... on ExternalProduct {
        ...ExternalProductFields
      }
      ... on GroupProduct {
        ...GroupProductFields
      }
    }
  }
`;

export const GET_PRODUCTS_BY_COLLECTION = gql`
  query GetProductsByCollection($collectionFilter: String!, $first: Int = 40) {
    products(first: $first, where: { status: "publish", collectionFilter: $collectionFilter }) {
      nodes {
        __typename
        ... on SimpleProduct {
          id
          databaseId
          name
          slug
          image { sourceUrl altText }
        }
        ... on VariableProduct {
          id
          databaseId
          name
          slug
          image { sourceUrl altText }
        }
      }
    }
  }
`;

export const GET_COLLECTION_PRODUCTS = gql`
  query GetCollectionProducts($first: Int = 24, $collectionFilterIn: [String]) {
    products(first: $first, where: { status: "publish", collectionFilterIn: $collectionFilterIn }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on SimpleProduct {
          id
          databaseId
          name
          slug
          type
          price
          regularPrice
          salePrice
          stockStatus
          image { id sourceUrl altText }
          strainTypes { nodes { name slug } }
          strainNames { nodes { name slug } }
          blendTypes { nodes { name slug } }
          productLines { nodes { name slug } }
          size { nodes { name slug } }
          mfproductTypes { nodes { name slug } }
          cannabinoids { nodes { name slug } }
          singleCannabinoid { nodes { name slug } }
          mG { nodes { name slug } }
          pieces { nodes { name slug } }
          bbLinkedBundleId
          bbFromPrice
        }
        ... on VariableProduct {
          id
          databaseId
          name
          slug
          type
          price
          regularPrice
          salePrice
          stockStatus
          image { id sourceUrl altText }
          strainTypes { nodes { name slug } }
          strainNames { nodes { name slug } }
          blendTypes { nodes { name slug } }
          productLines { nodes { name slug } }
          size { nodes { name slug } }
          mfproductTypes { nodes { name slug } }
          cannabinoids { nodes { name slug } }
          singleCannabinoid { nodes { name slug } }
          mG { nodes { name slug } }
          pieces { nodes { name slug } }
          bbLinkedBundleId
          bbFromPrice
        }
      }
    }
  }
`;

export const GET_COLLECTION_FACETS = gql`
  query GetCollectionFacets($collectionFilterIn: [String], $first: Int = 500) {
    products(first: $first, where: { status: "publish", collectionFilterIn: $collectionFilterIn }) {
      nodes {
        __typename
        ... on SimpleProduct {
          databaseId
          strainTypes { nodes { name slug } }
          blendTypes { nodes { name slug } }
          mfproductTypes { nodes { name slug } }
          cannabinoids { nodes { name slug } }
          singleCannabinoid { nodes { name slug } }
          size { nodes { name slug } }
          mG { nodes { name slug } }
          pieces { nodes { name slug } }
        }
        ... on VariableProduct {
          databaseId
          strainTypes { nodes { name slug } }
          blendTypes { nodes { name slug } }
          mfproductTypes { nodes { name slug } }
          cannabinoids { nodes { name slug } }
          singleCannabinoid { nodes { name slug } }
          size { nodes { name slug } }
          mG { nodes { name slug } }
          pieces { nodes { name slug } }
        }
      }
    }
  }
`;

export const GET_GIFT_PRODUCTS = gql`
  query GetGiftProducts($maxPrice: Float!, $minPrice: Float = 0.5, $first: Int = 12) {
    products(
      first: $first
      where: { status: "publish", minPrice: $minPrice, maxPrice: $maxPrice, orderby: { field: PRICE, order: DESC } }
    ) {
      nodes {
        __typename
        ... on SimpleProduct {
          id
          databaseId
          name
          slug
          price
          image { sourceUrl altText }
        }
      }
    }
  }
`;

export const GET_ALL_PRODUCT_SLUGS = gql`
  query GetAllProductSlugs {
    products(first: 100, where: { status: "publish" }) {
      nodes {
        ... on SimpleProduct {
          id
          databaseId
          slug
        }
        ... on VariableProduct {
          id
          databaseId
          slug
        }
        ... on ExternalProduct {
          id
          databaseId
          slug
        }
        ... on GroupProduct {
          id
          databaseId
          slug
        }
      }
    }
  }
`;

export const GET_PRODUCT_CATEGORIES = gql`
  query GetProductCategories {
    productCategories(first: 100) {
      nodes {
        id
        databaseId
        name
        slug
        count
      }
    }
  }
`;

export const GET_SHOP_FILTER_TERMS = gql`
  query GetShopFilterTerms {
    productTypes: mfproductTypes(first: 50) {
      nodes { name slug count }
    }
    strainTypes: strainTypes(first: 50) {
      nodes { name slug count }
    }
    blendTypes: blendTypes(first: 80) {
      nodes { name slug count }
    }
    sizes: allSize(first: 50) {
      nodes { name slug count }
    }
    mgs: allMG(first: 50) {
      nodes { name slug count }
    }
    pcs: pieces(first: 50) {
      nodes { name slug count }
    }
    cannabinoids: cannabinoids(first: 100) {
      nodes { name slug count }
    }
    singleCannabinoids: allSingleCannabinoid(first: 50) {
      nodes { name slug count }
    }
  }
`;

// Lean facet query — fetches 100 products with ONLY taxonomy data (no images,
// prices, descriptions). Used by shop, collections, and search to derive
// scoped sidebar filter counts without the weight of full product fragments.
export const GET_FACETS = gql`
  fragment FacetOnlyFields on Product {
    databaseId
    mfproductTypes { nodes { name slug } }
    size { nodes { name slug } }
    strainTypes { nodes { name slug } }
    blendTypes { nodes { name slug } }
    cannabinoids { nodes { name slug } }
    singleCannabinoid { nodes { name slug } }
    mG { nodes { name slug } }
    pieces { nodes { name slug } }
  }
  query GetFacets(
    $first: Int = 100
    $search: String
    $mfProductTypeIn: [String]
    $strainTypeFilterIn: [String]
    $blendTypeFilterIn: [String]
    $cannabinoidFilterIn: [String]
    $singleCannabinoidFilterIn: [String]
    $sizeFilterIn: [String]
    $mgFilterIn: [String]
    $piecesFilterIn: [String]
    $collectionFilterIn: [String]
  ) {
    products(first: $first, where: {
      status: "publish"
      search: $search
      mfProductTypeIn: $mfProductTypeIn
      strainTypeFilterIn: $strainTypeFilterIn
      blendTypeFilterIn: $blendTypeFilterIn
      cannabinoidFilterIn: $cannabinoidFilterIn
      singleCannabinoidFilterIn: $singleCannabinoidFilterIn
      sizeFilterIn: $sizeFilterIn
      mgFilterIn: $mgFilterIn
      piecesFilterIn: $piecesFilterIn
      collectionFilterIn: $collectionFilterIn
    }) {
      nodes {
        __typename
        ... on SimpleProduct { ...FacetOnlyFields }
        ... on VariableProduct { ...FacetOnlyFields }
        ... on ExternalProduct { ...FacetOnlyFields }
        ... on GroupProduct { ...FacetOnlyFields }
      }
    }
  }
`;

export const GET_PRODUCTS_BY_IDS = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetProductsByIds($ids: [Int]!) {
    products(first: 100, where: { include: $ids, status: "publish" }) {
      nodes {
        __typename
        ... on SimpleProduct {
          ...SimpleProductFields
        }
        ... on VariableProduct {
          ...VariableProductFields
        }
        ... on ExternalProduct {
          ...ExternalProductFields
        }
        ... on GroupProduct {
          ...GroupProductFields
        }
      }
    }
  }
`;

export const GET_PRODUCTS_BY_CATEGORY = gql`
  ${SIMPLE_PRODUCT_FIELDS}
  ${VARIABLE_PRODUCT_FIELDS}
  ${EXTERNAL_PRODUCT_FIELDS}
  ${GROUP_PRODUCT_FIELDS}
  query GetProductsByCategory($categorySlug: String!, $first: Int = 12, $after: String, $orderby: [ProductsOrderbyInput]) {
    products(
      first: $first
      after: $after
      where: { category: $categorySlug, status: "publish", orderby: $orderby }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on SimpleProduct {
          ...SimpleProductFields
        }
        ... on VariableProduct {
          ...VariableProductFields
        }
        ... on ExternalProduct {
          ...ExternalProductFields
        }
        ... on GroupProduct {
          ...GroupProductFields
        }
      }
    }
  }
`;
