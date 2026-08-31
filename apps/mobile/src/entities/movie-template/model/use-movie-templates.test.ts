import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { MovieTemplateCatalog } from '../lib/movie-template-catalog';
import type { MovieTemplate } from './movie-template';
import { useMovieTemplate, useMovieTemplates } from './use-movie-templates';

const mockGetMovieTemplates = jest.fn();
jest.mock('../api/get-movie-templates', () => ({
  getMovieTemplates: (...args: unknown[]) => mockGetMovieTemplates(...args),
}));

const serverTemplate: MovieTemplate = {
  id: 'market',
  name: '시장 한 바퀴',
  description: '서버가 새로 올린 템플릿',
  style: 'travel',
  bgm: 'sunny-side',
  slots: [{ id: 'gate', label: '입구', hint: '간판이 보이게' }],
};

// `gcTime: 0` because the default keeps a five-minute cache timer per query,
// which holds the Jest process open after the suite ends.
function render<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(hook, { wrapper });
}

beforeEach(() => jest.clearAllMocks());

describe('useMovieTemplates', () => {
  it('answers with the shipped catalog before the server has said anything', async () => {
    // Never resolving: this is the first paint of a cold start.
    mockGetMovieTemplates.mockReturnValue(new Promise(() => {}));

    const { result } = await render(() => useMovieTemplates());

    // No loading state on the app's home screen — the build carries four templates.
    expect(result.current).toEqual(MovieTemplateCatalog);
  });

  it('replaces the fallback with the server catalog once it arrives', async () => {
    mockGetMovieTemplates.mockResolvedValue([serverTemplate]);

    const { result } = await render(() => useMovieTemplates());

    await waitFor(() => expect(result.current).toEqual([serverTemplate]));
  });

  it('keeps the shipped catalog when the request fails', async () => {
    // Offline, endpoint down, or a build the server refuses — all the same
    // answer: the screen that was already drawn stays drawn.
    mockGetMovieTemplates.mockRejectedValue(new Error('offline'));

    const { result } = await render(() => useMovieTemplates());

    await waitFor(() => expect(mockGetMovieTemplates).toHaveBeenCalled());
    expect(result.current).toEqual(MovieTemplateCatalog);
  });

  it('keeps the shipped catalog when the server answers with nothing', async () => {
    // An empty catalog more likely means a seed did not run than that the
    // product has no templates.
    mockGetMovieTemplates.mockResolvedValue([]);

    const { result } = await render(() => useMovieTemplates());

    await waitFor(() => expect(mockGetMovieTemplates).toHaveBeenCalled());
    expect(result.current).toEqual(MovieTemplateCatalog);
  });
});

describe('useMovieTemplate', () => {
  it('finds a template by id', async () => {
    mockGetMovieTemplates.mockResolvedValue([serverTemplate]);

    const { result } = await render(() => useMovieTemplate('market'));

    await waitFor(() => expect(result.current?.name).toBe('시장 한 바퀴'));
  });

  it.each([
    ['an unknown id', 'nope'],
    ['no id', undefined],
  ] as const)('answers undefined for %s', async (_case, id) => {
    mockGetMovieTemplates.mockResolvedValue([serverTemplate]);

    const { result } = await render(() => useMovieTemplate(id));

    expect(result.current).toBeUndefined();
  });
});
