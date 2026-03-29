import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers"

export interface VKProfile {
  user: {
    user_id: string
    first_name: string
    last_name: string
    email?: string
    avatar?: string
  }
}

export function VKProvider(options: OAuthUserConfig<VKProfile>): OAuthConfig<VKProfile> {
  return {
    id: "vk",
    name: "VK ID",
    type: "oauth",
    authorization: {
      url: "https://id.vk.com/authorize",
      params: { scope: "email", response_type: "code" },
    },
    token: "https://id.vk.com/oauth2/auth",
    userinfo: "https://id.vk.com/oauth2/user_info",
    profile(profile) {
      return {
        id: profile.user.user_id,
        name: `${profile.user.first_name} ${profile.user.last_name}`.trim(),
        email: profile.user.email ?? null,
        image: profile.user.avatar ?? null,
      }
    },
    ...options,
  }
}
