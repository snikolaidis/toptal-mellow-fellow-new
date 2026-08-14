import { Product } from '@/types/woocommerce';

interface Props {
  product?: Product;
}

export default function Nutrition({ product }: Props) {

  return (
    <div className="product-nutrition">
      Nutrition     
    </div>
  )
}