import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Wrappers de navegacao que respeitam o prefixo de locale automaticamente.
// Usar estes no lugar de next/link e next/navigation nas telas localizadas.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
