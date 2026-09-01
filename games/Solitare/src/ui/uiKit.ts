/**
 * uiKit — 이식한 UI 모듈이 공유하는 최소 상수.
 *
 * 펌프러시에서 리그·이벤트 화면을 이식하면서 함께 들어왔다. 그쪽 uiKit 은 이 게임에 없는
 * 위젯까지 들고 있어 통째로 가져오지 않고, **정말 공유해야 하는 글꼴 스택 하나만** 옮겼다.
 *
 * ⚠️ 이 문자열은 게임 전체에서 같아야 한다(에디터 기본 폰트와도 동기). 바꾸려면 여기 한 곳만.
 */
export const FONT = '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';
