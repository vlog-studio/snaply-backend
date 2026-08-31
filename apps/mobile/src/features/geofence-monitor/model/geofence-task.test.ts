import { LocationGeofencingEventType } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { reportGeofenceEnter } from '../api/report-geofence-enter';
import { GEOFENCE_TASK_NAME } from './geofence-task';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('expo-location', () => ({
  LocationGeofencingEventType: { Enter: 1, Exit: 2 },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

jest.mock('../api/report-geofence-enter', () => ({ reportGeofenceEnter: jest.fn() }));

const mockDefineTask = TaskManager.defineTask as jest.Mock;
const mockReportGeofenceEnter = reportGeofenceEnter as jest.Mock;

type TaskHandler = (body: { data?: unknown; error?: { message: string } }) => Promise<void>;

const handler = mockDefineTask.mock.calls[0]?.[1] as TaskHandler;

function event(eventType: LocationGeofencingEventType, identifier?: string) {
  return {
    eventType,
    region: {
      identifier,
      latitude: 37.5,
      longitude: 127,
      radius: 100,
    },
  };
}

describe('geofence background task', () => {
  const nowSpy = jest.spyOn(Date, 'now');
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  beforeEach(() => {
    mockReportGeofenceEnter.mockReset();
    mockReportGeofenceEnter.mockResolvedValue(undefined);
    nowSpy.mockReturnValue(1_000_000);
  });

  afterAll(() => {
    nowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('registers once at module scope under the stable task name', () => {
    expect(mockDefineTask).toHaveBeenCalledTimes(1);
    expect(mockDefineTask).toHaveBeenCalledWith(GEOFENCE_TASK_NAME, expect.any(Function));
  });

  it('reports arrivals but ignores exits and malformed regions', async () => {
    await handler({ data: event(LocationGeofencingEventType.Exit, 'exit-only') });
    await handler({ data: event(LocationGeofencingEventType.Enter) });
    await handler({ data: event(LocationGeofencingEventType.Enter, 'arrival-1') });

    expect(mockReportGeofenceEnter).toHaveBeenCalledTimes(1);
    expect(mockReportGeofenceEnter).toHaveBeenCalledWith('arrival-1');
  });

  it('suppresses duplicate reports within the client cooldown but allows a later arrival', async () => {
    await handler({ data: event(LocationGeofencingEventType.Enter, 'cooldown-location') });

    nowSpy.mockReturnValue(1_000_000 + 4 * 60_000);
    await handler({ data: event(LocationGeofencingEventType.Enter, 'cooldown-location') });

    nowSpy.mockReturnValue(1_000_000 + 5 * 60_000);
    await handler({ data: event(LocationGeofencingEventType.Enter, 'cooldown-location') });

    expect(mockReportGeofenceEnter).toHaveBeenCalledTimes(2);
  });

  it('does not report when the operating system delivers a task error', async () => {
    await handler({ error: { message: 'native failure' } });

    expect(mockReportGeofenceEnter).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[geofence] task error:', 'native failure');
  });
});
