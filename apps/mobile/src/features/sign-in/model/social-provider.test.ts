import { offeredSocialProviders } from './social-provider';

describe('offeredSocialProviders', () => {
  it('offers only Google until Kakao sign-in is enabled', () => {
    expect(offeredSocialProviders(false).map((provider) => provider.id)).toEqual(['google']);
  });

  it('puts Kakao first once it is enabled', () => {
    expect(offeredSocialProviders(true).map((provider) => provider.id)).toEqual([
      'kakao',
      'google',
    ]);
  });

  it("styles the Kakao button by Kakao's login design guide", () => {
    const kakao = offeredSocialProviders(true).find((provider) => provider.id === 'kakao');

    expect(kakao).toEqual({
      id: 'kakao',
      label: '카카오 로그인',
      backgroundColor: '#FEE500',
      textColor: 'rgba(0, 0, 0, 0.85)',
      borderColor: '#FEE500',
    });
  });
});
