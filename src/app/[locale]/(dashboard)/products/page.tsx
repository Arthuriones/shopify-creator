import { getPickerStores } from "@/lib/stores/picker";
import { ProductsScreen } from "./products-screen";

// Busca as lojas no servidor e entrega prontas: a tela deixa de precisar
// autenticar e consultar pelo navegador antes de poder pedir os produtos.
export default async function ProductsPage() {
  const stores = await getPickerStores();
  return <ProductsScreen initialStores={stores} />;
}
