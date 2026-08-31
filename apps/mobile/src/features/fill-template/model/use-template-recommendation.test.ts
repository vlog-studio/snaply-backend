import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import type { Snap } from '@/entities/snap';

import { useTemplateRecommendation } from './use-template-recommendation';

const mockSyncEntries = jest.fn();
jest.mock('@/entities/snap', () => ({
  useSnapSyncEntries: () => mockSyncEntries(),
}));

// Without an API origin the app is in mock mode and never asks. These tests are
// about what it does when it *does* ask.
jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false }));

const mockRequest = jest.fn();
const mockGet = jest.fn();
jest.mock('../api/request-recommendation', () => ({
  requestRecommendation: (...args: unknown[]) => mockRequest(...args),
}));
jest.mock('../api/get-recommendation', () => ({
  getRecommendation: (...args: unknown[]) => mockGet(...args),
}));

const Noon = new Date('2026-08-19T12:00:00+09:00').getTime();

function makeSnap(id: string, minutes: number): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec: 3,
    capturedAt: Noon + minutes * 60_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  };
}

function uploaded(...ids: string[]) {
  return Object.fromEntries(ids.map((id) => [id, { status: 'uploaded', videoId: `v-${id}` }]));
}

function render(templateId: string | undefined, snaps: readonly Snap[] | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useTemplateRecommendation(templateId, snaps), { wrapper });
}

const outing = [makeSnap('a', 0), makeSnap('b', 10), makeSnap('c', 20)];

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncEntries.mockReturnValue(uploaded('a', 'b', 'c'));
});

describe('useTemplateRecommendation', () => {
  it('sends the uploaded snaps as candidates and maps the answer back to snap ids', async () => {
    mockRequest.mockResolvedValue('rec-1');
    mockGet.mockResolvedValue({
      id: 'rec-1',
      templateId: 'walk',
      status: 'done',
      slots: [
        { slotId: 'start', videoId: 'v-c', score: 0.91 },
        { slotId: 'alley', videoId: null, score: null },
      ],
    });

    const { result } = await render('walk', outing);

    await waitFor(() => expect(result.current).toEqual({ start: { snapId: 'c', score: 0.91 } }));
    expect(mockRequest).toHaveBeenCalledWith('walk', ['v-a', 'v-b', 'v-c'], expect.anything());
  });

  it('answers nothing while the server is still working', async () => {
    mockRequest.mockResolvedValue('rec-1');
    mockGet.mockResolvedValue({ id: 'rec-1', templateId: 'walk', status: 'processing', slots: [] });

    const { result } = await render('walk', outing);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it('answers nothing when the request is refused, without retrying', async () => {
    // The endpoint being switched off is the expected case before the feature is
    // enabled, and it costs the user nothing — the local match already drew.
    mockRequest.mockRejectedValue(new Error('RECOMMENDATION_DISABLED'));

    const { result } = await render('walk', outing);

    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    expect(result.current).toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('leaves snaps that have not finished uploading out of the candidates', async () => {
    mockSyncEntries.mockReturnValue({ ...uploaded('a', 'c'), b: { status: 'uploading' } });
    mockRequest.mockResolvedValue('rec-1');
    mockGet.mockResolvedValue({ id: 'rec-1', templateId: 'walk', status: 'done', slots: [] });

    await render('walk', outing);

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest).toHaveBeenCalledWith('walk', ['v-a', 'v-c'], expect.anything());
  });

  it('does not ask at all when fewer than two candidates are uploaded', async () => {
    mockSyncEntries.mockReturnValue(uploaded('a'));

    const { result } = await render('walk', outing);

    expect(result.current).toBeUndefined();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('does not ask without a template', async () => {
    await render(undefined, outing);

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('samples down to the server cap, keeping the first and last of the outing', async () => {
    const long = Array.from({ length: 20 }, (_, index) => makeSnap(`s${index}`, index));
    mockSyncEntries.mockReturnValue(uploaded(...long.map((snap) => snap.id)));
    mockRequest.mockResolvedValue('rec-1');
    mockGet.mockResolvedValue({ id: 'rec-1', templateId: 'walk', status: 'done', slots: [] });

    await render('walk', long);

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    const candidates = mockRequest.mock.calls[0][1] as string[];
    expect(candidates).toHaveLength(12);
    expect(candidates[0]).toBe('v-s0');
    expect(candidates[11]).toBe('v-s19');
  });

  it('drops an assignment whose video no longer maps to a local snap', async () => {
    mockRequest.mockResolvedValue('rec-1');
    mockGet.mockResolvedValue({
      id: 'rec-1',
      templateId: 'walk',
      status: 'done',
      slots: [{ slotId: 'start', videoId: 'v-deleted', score: 0.8 }],
    });

    const { result } = await render('walk', outing);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    // An answer that fills nothing is the same as no answer.
    expect(result.current).toBeUndefined();
  });
});
