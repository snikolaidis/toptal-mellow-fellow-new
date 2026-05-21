import { ProductCategory } from '@/types/woocommerce';

interface CategoryCount {
  [slug: string]: number;
}

interface ShopSidebarProps {
  categories: ProductCategory[];
  selectedCategory: string;
  onCategoryChange: (slug: string) => void;
  productCount?: number;
  categoryCounts?: CategoryCount;
}

export default function ShopSidebar({
  categories,
  selectedCategory,
  onCategoryChange,
  productCount,
  categoryCounts,
}: ShopSidebarProps) {
  // Sort categories alphabetically, but keep "Uncategorized" at the end if it exists
  // Also filter out categories with 0 products if we have counts
  const sortedCategories = [...categories]
    .filter((cat) => {
      // If we have calculated counts, only show categories with products
      if (categoryCounts) {
        return (categoryCounts[cat.slug] || 0) > 0;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.slug === 'uncategorized') return 1;
      if (b.slug === 'uncategorized') return -1;
      return a.name.localeCompare(b.name);
    });

  return (
    <aside className="shop-sidebar">
      <div className="sidebar-section">
        <h3 className="sidebar-title">Categories</h3>
        <ul className="category-list">
          <li>
            <button
              onClick={() => onCategoryChange('all')}
              className={`category-item ${selectedCategory === 'all' ? 'active' : ''}`}
            >
              <span className="category-name">All Products</span>
              {productCount !== undefined && (
                <span className="category-count">{productCount}</span>
              )}
            </button>
          </li>
          {sortedCategories.map((category) => {
            // Use calculated count if available, otherwise fall back to WordPress count
            const count = categoryCounts
              ? categoryCounts[category.slug] || 0
              : category.count;

            return (
              <li key={category.id}>
                <button
                  onClick={() => onCategoryChange(category.slug)}
                  className={`category-item ${selectedCategory === category.slug ? 'active' : ''}`}
                >
                  <span className="category-name">{category.name}</span>
                  {count !== undefined && count > 0 && (
                    <span className="category-count">{count}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
