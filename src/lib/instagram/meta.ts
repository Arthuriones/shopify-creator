export const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION?.trim() || "v24.0";

export const INSTAGRAM_OAUTH_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

export function getInstagramClientId() {
  return (
    process.env.INSTAGRAM_CLIENT_ID?.trim() ||
    process.env.META_APP_ID?.trim() ||
    ""
  );
}

function getInstagramClientSecret() {
  return (
    process.env.INSTAGRAM_CLIENT_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim() ||
    ""
  );
}

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

export function instagramGraphUrl(path: string, includeVersion = true) {
  const version = includeVersion ? `/${META_GRAPH_VERSION}` : "";
  return `https://graph.instagram.com${version}${path}`;
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
  const appId = getInstagramClientId();
  const appSecret = getInstagramClientSecret();
  if (!appId || !appSecret) {
    throw new Error(
      "Configure INSTAGRAM_CLIENT_ID/INSTAGRAM_CLIENT_SECRET ou META_APP_ID/META_APP_SECRET para conectar Instagram."
    );
  }

  return readJsonResponse<{
    access_token: string;
    user_id?: number | string;
    token_type?: string;
    expires_in?: number;
  }>(
    await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
        code: input.code,
      }),
    })
  );
}

export async function exchangeForLongLivedToken(shortToken: string) {
  const appSecret = getInstagramClientSecret();
  if (!appSecret) {
    throw new Error("Configure INSTAGRAM_CLIENT_SECRET ou META_APP_SECRET para renovar o token do Instagram.");
  }

  const url = new URL(instagramGraphUrl("/access_token", false));
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortToken);

  return readJsonResponse<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(await fetch(url));
}

export async function resolveInstagramBusinessAccount(accessToken: string) {
  const url = new URL(instagramGraphUrl("/me"));
  url.searchParams.set("fields", "id,username,account_type,media_count");
  url.searchParams.set("access_token", accessToken);

  const data = await readJsonResponse<{
    id: string;
    username?: string;
    account_type?: string;
    media_count?: number;
  }>(await fetch(url));

  if (!data.id) {
    throw new Error(
      "Nao foi possivel identificar a conta profissional do Instagram."
    );
  }

  const accountType = String(data.account_type || "").toUpperCase();
  if (accountType && !["BUSINESS", "CREATOR"].includes(accountType)) {
    throw new Error(
      "Conecte uma conta Instagram profissional, do tipo Empresa ou Criador."
    );
  }

  return {
    instagramBusinessAccountId: data.id,
    instagramUsername: data.username || null,
    accountType: data.account_type || null,
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
      await fetch(instagramGraphUrl(`/${input.instagramUserId}/media`), {
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
    await fetch(instagramGraphUrl(`/${input.instagramUserId}/media`), {
      method: "POST",
      body: carouselForm,
    })
  );

  const publishForm = new URLSearchParams();
  publishForm.set("creation_id", carousel.id);
  publishForm.set("access_token", input.accessToken);

  const published = await readJsonResponse<{ id: string }>(
    await fetch(instagramGraphUrl(`/${input.instagramUserId}/media_publish`), {
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
