# 실제 Android 기기 무선(Wi-Fi) 연동 가이드

> 이 문서는 사람 개발자를 위한 한글 가이드입니다. 에이전트용 문서가 아니므로 `AGENTS.md` 색인에 포함하지 않습니다.

USB 케이블 없이 실제 Android 기기를 Wi-Fi로 adb에 연결하고 이 앱을 실행·디버깅하는 절차를 정리합니다. 검증 정책과 기기 연결 규칙은 [`docs/workflows/local-development-and-testing.md`](../workflows/local-development-and-testing.md)(영문, 에이전트용)가 기준입니다.

> **이 앱은 Android Expo Go에서 부팅되지 않습니다.** 시작 시 `expo-notifications`를 import하는데 SDK 53부터 Android Expo Go에서 제거된 모듈이라 렌더 이전에 죽습니다. 아래 **1~2단계(무선 adb 연결)** 는 그대로 유효하고, 앱 실행은 [네이티브 개발 빌드](#네이티브-개발-빌드가-필요한-경우) 절차를 쓰세요. 3~4단계의 Expo Go 절차는 iOS 시뮬레이터와 과거 이력을 위해 남겨둔 참고 자료입니다.

## 사전 준비

- **Mac과 Android 기기가 같은 Wi-Fi 네트워크**에 연결되어 있어야 합니다. (게스트 네트워크처럼 기기 간 통신을 차단하는 AP에서는 동작하지 않습니다.)
- 기기에서 **개발자 옵션**을 활성화합니다: `설정 > 휴대전화 정보 > 빌드 번호`를 7번 연속 탭.
- `설정 > 개발자 옵션 > 무선 디버깅`을 켭니다. (Android 11 이상 필요. Android 10 이하는 아래 [USB 경유 방식](#대안-usb로-한-번-연결해서-tcpip-모드-전환-android-10-이하-포함) 사용.)
- 이 Mac의 adb 경로는 `~/Library/Android/sdk/platform-tools/adb`입니다. 매번 전체 경로를 치기 번거로우면 셸에서 다음을 실행해 두세요:

  ```bash
  export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
  ```

## 1. 최초 페어링 (기기당 1회)

Android 11 이상에서는 페어링 코드 방식을 사용합니다.

1. 기기에서 `개발자 옵션 > 무선 디버깅` 화면을 열고 **"페어링 코드로 기기 페어링"** 을 탭합니다.
2. 화면에 **6자리 코드**와 **`IP 주소:포트`** 가 표시됩니다. 이 포트는 페어링 전용 포트입니다.
3. Mac에서 페어링을 실행하고, 프롬프트에 6자리 코드를 입력합니다:

   ```bash
   adb pair 192.168.0.42:37187        # 기기 화면에 표시된 IP:페어링 포트로 교체
   # Enter pairing code: ______
   ```

4. `Successfully paired ...` 가 출력되면 페어링 완료입니다. 페어링은 기기당 한 번만 하면 됩니다.

## 2. 연결

페어링 다이얼로그를 닫으면 **무선 디버깅 메인 화면**에 별도의 `IP 주소:포트`가 표시됩니다. **페어링 때 쓴 포트와 다른 포트**이므로 주의하세요.

```bash
adb connect 192.168.0.42:40913       # 무선 디버깅 메인 화면의 IP:포트로 교체
adb devices                          # "192.168.0.42:40913  device" 가 보이면 성공
```

이후 모든 adb 명령이 USB 연결과 동일하게 동작합니다(`adb install`, `adb logcat`, `adb reverse` 등).

> **포트는 고정이 아닙니다.** 무선 디버깅을 껐다 켜거나 기기를 재부팅하면 연결 포트가 바뀝니다. 연결이 안 되면 기기의 무선 디버깅 화면에서 현재 포트를 다시 확인하세요.

### 대안: USB로 한 번 연결해서 tcpip 모드 전환 (Android 10 이하 포함)

페어링 방식이 동작하지 않거나 Android 10 이하 기기인 경우, USB로 한 번만 연결해 TCP 모드로 전환할 수 있습니다:

```bash
adb tcpip 5555                       # USB 연결 상태에서 실행
adb connect 192.168.0.42:5555        # 기기 IP는 설정 > 휴대전화 정보 > 상태에서 확인
# 이후 USB 케이블 분리
```

이 방식의 포트(5555)는 기기를 재부팅하기 전까지 유지됩니다.

## 3. Expo Go 설치 (기기당 1회)

이 프로젝트는 Expo SDK 57을 사용하므로 **SDK 57과 호환되는 Expo Go**가 필요합니다. Play 스토어 버전은 최신 SDK 기준으로 갱신되므로, 버전이 맞지 않으면 SDK 57용 APK를 직접 설치하세요:

```bash
curl -sL -o /tmp/ExpoGo.apk "https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.2/Expo-Go-57.0.2.apk"
adb -s 192.168.0.42:40913 install -r /tmp/ExpoGo.apk
```

기기가 하나만 연결돼 있으면 `-s ...` 는 생략해도 됩니다. 에뮬레이터가 함께 떠 있으면 반드시 `-s <IP:포트>` 로 실기기를 지정하세요("more than one device" 오류 방지).

## 4. 앱 실행

Metro 서버를 시작합니다:

```bash
npx expo start --go
```

기기에서 앱을 여는 방법은 두 가지입니다.

### 방법 A — QR 코드 스캔 (가장 간단)

Metro 터미널에 출력되는 QR 코드를 기기 카메라 또는 Expo Go 앱으로 스캔합니다. 기기가 Mac의 LAN 주소(`exp://192.168.x.x:8081`)로 직접 접속합니다.

### 방법 B — adb reverse (QR 접속이 안 될 때)

macOS 방화벽이 8081 포트 수신을 차단하거나 공유기가 기기 간 통신을 막는 경우, 무선 adb 연결을 터널로 사용해 우회할 수 있습니다:

```bash
adb -s 192.168.0.42:40913 reverse tcp:8081 tcp:8081
adb -s 192.168.0.42:40913 shell am start \
  -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" host.exp.exponent
```

`adb reverse` 는 무선 연결에서도 동일하게 동작하며, 기기의 `127.0.0.1:8081` 요청이 adb를 통해 Mac의 Metro로 전달됩니다.

### 개발 중 조작

- 코드 수정은 Fast Refresh로 자동 반영됩니다.
- 개발자 메뉴: 기기를 흔들거나 `adb shell input keyevent 82`.
- 스크린샷 캡처:

  ```bash
  adb -s 192.168.0.42:40913 exec-out screencap -p > /tmp/device.png
  ```

## 네이티브 개발 빌드가 필요한 경우

**Android에서는 이 경로가 기본입니다** (위 경고 참고). 무선 adb 연결 상태에서 로컬 네이티브 빌드를 실기기에 설치합니다(iOS와 달리 Android 로컬 빌드는 이 Mac에서 가능):

```bash
npm run android:device               # expo run:android --device — 연결된 기기 목록에서 실기기 선택
```

이후 Metro는 `npx expo start --dev-client`로 붙입니다.

빌드 중 `packageDebug` 단계에서 `IncrementalSplitterRunnable` 오류가 나면 일시적인 문제이므로 같은 명령을 다시 실행하면 됩니다.

## 문제 해결

| 증상 | 조치 |
| --- | --- |
| `adb connect` 이 `failed to connect` 으로 실패 | 기기의 무선 디버깅 화면에서 **현재 포트**를 다시 확인 (껐다 켜면 포트가 바뀜). Mac과 기기가 같은 Wi-Fi인지 확인. |
| `adb devices` 에 `offline` 으로 표시 | `adb disconnect` 후 재연결. 그래도 안 되면 `adb kill-server && adb start-server` 후 다시 `adb connect`. |
| 연결이 수시로 끊김 | 기기 절전 시 Wi-Fi가 꺼지지 않도록 설정하거나, 개발 중에는 `개발자 옵션 > 화면 켜짐 상태 유지`를 활성화. |
| `more than one device/emulator` 오류 | 에뮬레이터가 함께 떠 있는 상태. 모든 adb 명령에 `-s <IP:포트>` 를 붙여 실기기를 지정. |
| QR 스캔 후 Expo Go가 서버에 접속 못 함 | macOS 방화벽에서 node(Metro) 수신 허용, 또는 [방법 B(adb reverse)](#방법-b--adb-reverse-qr-접속이-안-될-때) 사용. |
| 같은 네트워크의 기기를 자동 탐색하고 싶음 | `adb mdns services` 로 무선 디버깅이 켜진 기기를 검색할 수 있음. |

## 연결 해제

```bash
adb disconnect 192.168.0.42:40913    # 특정 기기만 해제
adb disconnect                        # 모든 무선 연결 해제
```

보안상 외부 네트워크(카페 등)에서는 사용 후 기기의 **무선 디버깅을 꺼 두는 것**을 권장합니다.
