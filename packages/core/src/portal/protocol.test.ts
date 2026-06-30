import { describe, it, expect } from 'vitest';
import {
  PORTAL_NS,
  msg,
  parseMsg,
  isAllowedOrigin,
  parseHubOrigin,
} from './protocol.js';

describe('portal/protocol parseMsg', () => {
  it('유효한 loading 메시지를 통과시키고 progress 를 0..1 로 클램프한다', () => {
    expect(parseMsg(msg.loading(0.5))).toEqual({ ns: PORTAL_NS, type: 'loading', progress: 0.5 });
    expect(parseMsg({ ns: PORTAL_NS, type: 'loading', progress: 1.7 })).toMatchObject({ progress: 1 });
    expect(parseMsg({ ns: PORTAL_NS, type: 'loading', progress: -3 })).toMatchObject({ progress: 0 });
    expect(parseMsg({ ns: PORTAL_NS, type: 'loading', progress: NaN })).toMatchObject({ progress: 0 });
  });

  it('단순 신호(ready/started/exit/ack/hello)를 통과시킨다', () => {
    expect(parseMsg(msg.ready())).toEqual({ ns: PORTAL_NS, type: 'ready' });
    expect(parseMsg(msg.started())).toEqual({ ns: PORTAL_NS, type: 'started' });
    expect(parseMsg(msg.exit())).toEqual({ ns: PORTAL_NS, type: 'exit' });
    expect(parseMsg(msg.hello('archerystars'))).toEqual({ ns: PORTAL_NS, type: 'hello', id: 'archerystars' });
  });

  it('네임스페이스/타입 불량·비객체는 null 로 거부한다', () => {
    expect(parseMsg(null)).toBeNull();
    expect(parseMsg('hello')).toBeNull();
    expect(parseMsg({ type: 'ready' })).toBeNull(); // ns 없음
    expect(parseMsg({ ns: 'other', type: 'ready' })).toBeNull(); // 다른 ns
    expect(parseMsg({ ns: PORTAL_NS, type: 'unknown' })).toBeNull(); // 미지 타입
    expect(parseMsg({ ns: PORTAL_NS, type: 'loading' })).toBeNull(); // progress 누락
  });
});

describe('portal/protocol isAllowedOrigin', () => {
  it('허용 목록에 있을 때만 true', () => {
    const allowed = ['http://localhost:6199', 'https://play.example.com'];
    expect(isAllowedOrigin('http://localhost:6199', allowed)).toBe(true);
    expect(isAllowedOrigin('http://localhost:6200', allowed)).toBe(false);
  });

  it('빈 origin·빈 목록·null 항목을 안전하게 거부한다', () => {
    expect(isAllowedOrigin('', ['http://localhost:6199'])).toBe(false);
    expect(isAllowedOrigin('http://localhost:6199', [])).toBe(false);
    expect(isAllowedOrigin('http://localhost:6199', [null, undefined])).toBe(false);
  });
});

describe('portal/protocol parseHubOrigin', () => {
  it('?portal=<origin> 에서 origin 을 추출한다(앞 ? 유무 무관)', () => {
    expect(parseHubOrigin('?portal=http%3A%2F%2Flocalhost%3A5180')).toBe('http://localhost:5180');
    expect(parseHubOrigin('portal=https://play.example.com/path')).toBe('https://play.example.com');
  });

  it('파라미터 없음·형식 불량이면 null', () => {
    expect(parseHubOrigin('')).toBeNull();
    expect(parseHubOrigin('?foo=bar')).toBeNull();
    expect(parseHubOrigin('?portal=not-a-url')).toBeNull();
  });
});
