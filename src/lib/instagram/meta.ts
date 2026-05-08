export const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION?.trim() || "v24.0";

export const INSTAGRAM_OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
].join(",");

export interface InstagramConnection {
  id?: string;
  user_id: string;
  instagram_user_id: string;
  instagram_business_account_id: string;
  instagram_username?: string | null;
  page_id?: string | null;
  page_name?: string | null;
  access_token: string;
  page_access_token?: string | null;
  token_expires_at?: string | null;
}

export function graphUrl(path: string) {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}${path}`;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error_description ||
      `Meta API retornou HTTP ${response.status}.`;
    throw new Error(message);
  }
  return data as T;
}

export async function exchangeCodeForUserToken(input: {
  code: string;
  redirectUri: string;
}) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Configure META_APP_ID e META_APP_SECRET para conectar Instagram.");
  }

  const url = new URL(graphUrl("/oauth/access_token"));
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code", input.code);

  return readJsonResponse<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(await fetch(url));
}

export async function exchangeForLongLivedToken(shortToken: string) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    throw new Error("Configure META_APP_SECRET para renovar o token do Instagram.");
  }

  const url = new URL(graphUrl("/oauth/access_token"));
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);

  return readJsonResponse<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(await fetch(url));
}

export async function resolveInstagramBusinessAccount(accessToken: string) {
  const url = new URL(graphUrl("/me/accounts"));
  url.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}"
  );
  url.searchParams.set("access_token", accessToken);

  const data = await readJsonResponse<{
    data?: {
      id: string;
      name: string;
      access_token?: string;
      instagram_business_account?: { id: string; username?: string };
    }[];
  }>(await fetch(url));

  const page = data.data?.find((item) => item.instagram_business_account?.id);
  if (!page?.instagram_business_account?.id) {
    throw new Error(
      "Nenhuma conta profissional do Instagram vinculada a uma Página foi encontrada."
    );
  }

  return {
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    instagramBusinessAccountId: page.instagram_business_account.id,
    instagramUsername: page.instagram_business_account.username || null,
  };
}

export async function createInstagramCarousel(input: {
  instagramUserId: string;
  accessToken: string;
  imageUrls: string[];
  caption: string;
}) {
  const imageUrls = input.imageUrls.slice(0, 10);
  if (imageUrls.length < 2) {
    throw new Error("Carrossel do Instagram precisa de pelo menos 2 imagens.");
  }

  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const form = new URLSearchParams();
    form.set("image_url", imageUrl);
    form.set("is_carousel_item", "true");
    form.set("access_token", input.accessToken);

    const child = await readJsonResponse<{ id: string }>(
      await fetch(graphUrl(`/${input.instagramUserId}/media`), {
        method: "POST",
        body: form,
      })
    );
    childIds.push(child.id);
  }

  const carouselForm = new URLSearchParams();
  carouselForm.set("media_type", "CAROUSEL");
  carouselForm.set("children", childIds.join(","));
  carouselForm.set("caption", input.caption.slice(0, 2200));
  carouselForm.set("access_token", input.accessToken);

  const carousel = await readJsonResponse<{ id: string }>(
    await fetch(graphUrl(`/${input.instagramUserId}/media`), {
      method: "POST",
      body: carouselForm,
    })
  );

  const publishForm = new URLSearchParams();
  publishForm.set("creation_id", carousel.id);
  publishForm.set("access_token", input.accessToken);

  const published = await readJsonResponse<{ id: string }>(
    await fetch(graphUrl(`/${input.instagramUserId}/media_publish`), {
      method: "POST",
      body: publishForm,
    })
  );

  return {
    childIds,
    carouselContainerId: carousel.id,
    publishedMediaId: published.id,
  };
}
