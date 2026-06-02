import { ProductCategory } from '@/types/woocommerce';

interface ShopSidebarProps {
  categories: ProductCategory[];
  selectedCategory: string;
  onCategoryChange: (slug: string) => void;
}

export default function ShopSidebar({
  categories,
  selectedCategory,
  onCategoryChange,
}: ShopSidebarProps) {
  const sortedCategories = [...categories]
    .filter((cat) => cat.slug !== 'uncategorized' && (cat.count || 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

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
            </button>
          </li>
          {sortedCategories.map((category) => (
            <li key={category.id}>
              <button
                onClick={() => onCategoryChange(category.slug)}
                className={`category-item ${selectedCategory === category.slug ? 'active' : ''}`}
              >
                <span className="category-name">{category.name}</span>
                {category.count !== undefined && category.count > 0 && (
                  <span className="category-count">{category.count}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
