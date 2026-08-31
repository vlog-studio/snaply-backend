import { Image, type ImageSource } from 'expo-image';

import type { SocialProvider } from '@/entities/session';

/** Official brand marks, one per provider, rendered as SVG assets. */
const providerIcons: Record<SocialProvider, ImageSource> = {
  google: require('./provider-icons/google.svg'),
  apple: require('./provider-icons/apple.svg'),
};

type ProviderIconProps = {
  provider: SocialProvider;
  size?: number;
};

/** Renders the given provider's official logo at a fixed square size. */
export function ProviderIcon({ provider, size = 20 }: ProviderIconProps) {
  return (
    <Image
      source={providerIcons[provider]}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
    />
  );
}
