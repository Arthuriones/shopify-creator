import { getStoresWithRoles } from "@/lib/stores/queries";
import { StoresScreen } from "./stores-screen";

// A pagina roda no servidor: busca as lojas ao lado do banco e entrega o HTML
// pronto. O que precisa de clique continua no cliente, dentro de StoresScreen.
export default async function StoresPage() {
  const stores = await getStoresWithRoles();
  return <StoresScreen initialStores={stores} />;
}
