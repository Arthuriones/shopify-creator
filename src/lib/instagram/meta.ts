export const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION?.trim() || "v24.0";

export const INSTAGRAM_OAUTH_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

export const FACEBOOK_INSTAGRAM_OAUTH_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export function getInstagramAuthMode() {
  return process.env.INSTAGRAM_AUTH_MODE?.trim().toLowerCase() === "instagram"
    ? "instagram"
    : "facebook";
}

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

function getFacebookClientId() {
  return process.env.META_APP_ID?.trim() || getInstagramClientId();
}

function getFacebookClientSecret() {
  return process.env.META_APP_SECRET?.trim() || getInstagramClientSecret();
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

export function facebookGraphUrl(path: string) {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}${path}`;
}

async function readJsonResponse<T>(
  response: Response,
  context?: { endpoint?: string; method?: string }
): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error_description ||
      `Meta API retornou HTTP ${response.status}.`;
    const operation = context?.endpoint
      ? `${context.method || "GET"} ${context.endpoint}`
      : "Meta API";
    throw new Error(`${operation}: ${message}`);
  }
  return data as T;
}

function firstDataItem<T>(data: T | { data?: T[] }): T {
  if (
    data &&
    typeof data === "object" &&
    "data" in data &&
    Array.isArray((data as { data?: T[] }).data)
  ) {
    const first = (data as { data?: T[] }).data?.[0];
    if (first) return first;
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

  const data = await readJsonResponse<
    | {
        access_token: string;
        user_id?: number | string;
        permissions?: string;
        token_type?: string;
        expires_in?: number;
      }
    | {
        data?: {
          access_token: string;
          user_id?: number | string;
          permissions?: string;
          token_type?: string;
          expires_in?: number;
        }[];
      }
  >(
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

  const token = firstDataItem<{
    access_token: string;
    user_id?: number | string;
    permissions?: string;
    token_type?: string;
    expires_in?: number;
  }>(data);

  if (!token.access_token) {
    throw new Error("A Meta nao retornou access_token no callback do Instagram.");
  }

  return token;
}

export async function exchangeFacebookCodeForUserToken(input: {
  code: string;
  redirectUri: string;
}) {
  const appId = getFacebookClientId();
  const appSecret = getFacebookClientSecret();
  if (!appId || !appSecret) {
    throw new Error("Configure META_APP_ID e META_APP_SECRET para o Login do Facebook.");
  }

  const url = new URL(facebookGraphUrl("/oauth/access_token"));
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code", input.code);

  return readJsonResponse<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(await fetch(url), { endpoint: "/oauth/access_token", method: "GET" });
}

export async function exchangeForLongLivedFacebookToken(shortToken: string) {
  const appId = getFacebookClientId();
  const appSecret = getFacebookClientSecret();
  if (!appId || !appSecret) {
    throw new Error("Configure META_APP_ID e META_APP_SECRET para renovar o token.");
  }

  const url = new URL(facebookGraphUrl("/oauth/access_token"));
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);

  return readJsonResponse<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(await fetch(url), { endpoint: "/oauth/access_token", method: "GET" });
}

export async function exchangeForLongLivedToken(shortToken: string) {
  const appSecret = getInstagramClientSecret();
  if (!appSecret) {
    throw new Error("Configure INSTAGRAM_CLIENT_SECRET ou META_APP_SECRET para renovar o token do Instagram.");
  }
  if (!shortToken) {
    throw new Error("Token curto do Instagram ausente.");
  }

  const url = new URL(instagramGraphUrl("/access_token", false));
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortToken);

  try {
    return await readJsonResponse<{
      access_token: string;
      token_type?: string;
      expires_in?: number;
    }>(await fetch(url));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("method type: get")) {
      throw error;
    }
  }

  return readJsonResponse<{
    access_token: string;
    token_type?: string;
    expires_in?: number;
  }>(
    await fetch(instagramGraphUrl("/access_token", false), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: appSecret,
        access_token: shortToken,
      }),
    })
  );
}

export async function resolveInstagramBusinessAccount(accessToken: string) {
  const url = new URL(instagramGraphUrl("/me"));
  url.searchParams.set("fields", "user_id,username,account_type,media_count");
  url.searchParams.set("access_token", accessToken);

  const data = await readJsonResponse<
    | {
        id?: string;
        user_id?: string;
        username?: string;
        account_type?: string;
        media_count?: number;
      }
    | {
        data?: {
          id?: string;
          user_id?: string;
          username?: string;
          account_type?: string;
          media_count?: number;
        }[];
      }
  >(await fetch(url), { endpoint: "/me", method: "GET" });

  const account = firstDataItem<{
    id?: string;
    user_id?: string;
    username?: string;
    account_type?: string;
    media_count?: number;
  }>(data);
  const instagramUserId = account.user_id || account.id;

  if (!instagramUserId) {
    throw new Error(
      "Nao foi possivel identificar a conta profissional do Instagram."
    );
  }

  const accountType = String(account.account_type || "").toUpperCase();
  if (accountType && !["BUSINESS", "CREATOR", "MEDIA_CREATOR"].includes(accountType)) {
    throw new Error(
      "Conecte uma conta Instagram profissional, do tipo Empresa ou Criador."
    );
  }

  return {
    instagramBusinessAccountId: instagramUserId,
    instagramUsername: account.username || null,
    accountType: account.account_type || null,
  };
}

export async function resolveFacebookInstagramBusinessAccount(accessToken: string) {
  const url = new URL(facebookGraphUrl("/me/accounts"));
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
  }>(await fetch(url), { endpoint: "/me/accounts", method: "GET" });

  const page = data.data?.find((item) => item.instagram_business_account?.id);
  if (!page?.instagram_business_account?.id) {
    throw new Error(
      "Nenhuma Pagina com Instagram profissional conectado foi encontrada. Conecte o Instagram a uma Pagina do Facebook e autorize pages_show_list, pages_read_engagement, instagram_basic e instagram_content_publish."
    );
  }

  return {
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token || accessToken,
    instagramBusinessAccountId: page.instagram_business_account.id,
    instagramUsername: page.instagram_business_account.username || null,
    accountType: "Facebook Login",
  };
}

async function instagramPostJson<T>(
  endpoint: string,
  accessToken: string,
  body: Record<string, unknown>,
  host: "instagram" | "facebook" = "instagram"
) {
  const url =
    host === "facebook" ? facebookGraphUrl(endpoint) : instagramGraphUrl(endpoint);
  const form = new URLSearchParams();
  Object.entries(body).forEach(([key, value]) => {
    form.set(key, Array.isArray(value) ? value.join(",") : String(value));
  });
  form.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    body: form,
  });

  return readJsonResponse<T>(response, { endpoint, method: "POST" });
}

export async function createInstagramPost(input: {
  instagramUserId: string;
  accessToken: string;
  imageUrls: string[];
  caption: string;
  graphHost?: "instagram" | "facebook";
}) {
  const imageUrls = input.imageUrls.slice(0, 10);
  const graphHost = input.graphHost || "instagram";
  if (imageUrls.length < 1) {
    throw new Error("Selecione pelo menos 1 imagem para publicar no Instagram.");
  }

  if (imageUrls.length === 1) {
    const container = await instagramPostJson<{ id: string }>(
      `/${input.instagramUserId}/media`,
      input.accessToken,
      {
        image_url: imageUrls[0],
        caption: input.caption.slice(0, 2200),
      },
      graphHost
    );

    const published = await instagramPostJson<{ id: string }>(
      `/${input.instagramUserId}/media_publish`,
      input.accessToken,
      { creation_id: container.id },
      graphHost
    );

    return {
      type: "single_image" as const,
      childIds: [],
      containerId: container.id,
      publishedMediaId: published.id,
    };
  }

  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const child = await instagramPostJson<{ id: string }>(
      `/${input.instagramUserId}/media`,
      input.accessToken,
      {
        image_url: imageUrl,
        is_carousel_item: true,
      },
      graphHost
    );
    childIds.push(child.id);
  }

  const carousel = await instagramPostJson<{ id: string }>(
    `/${input.instagramUserId}/media`,
    input.accessToken,
    {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: input.caption.slice(0, 2200),
    },
    graphHost
  );

  const published = await instagramPostJson<{ id: string }>(
    `/${input.instagramUserId}/media_publish`,
    input.accessToken,
    { creation_id: carousel.id },
    graphHost
  );

  return {
    type: "carousel" as const,
    childIds,
    containerId: carousel.id,
    carouselContainerId: carousel.id,
    publishedMediaId: published.id,
  };
}
