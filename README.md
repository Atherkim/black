# 펠트 — 멀티플레이 블랙잭

친구들과 방 코드 하나로 실시간 블랙잭을 즐기는 웹 앱입니다.
서버 코드 없이 **정적 HTML/CSS/JS + Firebase Realtime Database**만으로 동작하며,
**GitHub Pages**로 무료 배포합니다.

---

## 0. 무엇이 필요한가요

| 용도 | 서비스 | 비용 |
|---|---|---|
| 웹사이트 호스팅 | GitHub Pages | 무료 |
| 실시간 데이터 동기화 | Firebase Realtime Database (Spark 요금제) | 무료 |

둘 다 신용카드 없이 무료 플랜으로 충분합니다 (친구 몇 명이 가볍게 플레이하는 수준).

---

## 1. Firebase 프로젝트 만들기

1. [console.firebase.google.com](https://console.firebase.google.com) 접속 → 구글 계정으로 로그인
2. **프로젝트 추가** 클릭 → 이름 입력 (예: `felt-blackjack`) → 애널리틱스는 꺼도 무방 → 프로젝트 생성
3. 왼쪽 메뉴 **빌드 → Realtime Database** 클릭 → **데이터베이스 만들기**
   - 위치: 아무 지역이나 선택 (한국과 가까운 `asia-southeast1` 추천)
   - 보안 규칙: 우선 **테스트 모드로 시작** 선택 (아래 4단계에서 규칙을 바꿀 거예요)
4. 왼쪽 메뉴 **프로젝트 설정(⚙️) → 일반** 탭으로 이동 → 아래로 스크롤 →
   **내 앱** 섹션에서 `</>` (웹) 아이콘 클릭 → 앱 닉네임 입력 → **앱 등록**
5. 화면에 나오는 `firebaseConfig` 객체를 통째로 복사합니다. 예:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "felt-blackjack.firebaseapp.com",
     databaseURL: "https://felt-blackjack-default-rtdb.asia-southeast1.firebasedatabase.app",
     projectId: "felt-blackjack",
     storageBucket: "felt-blackjack.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
6. 이 저장소의 `firebase-config.js` 파일을 열어 `firebaseConfig` 값을 방금 복사한 값으로 **그대로 교체**하세요.

> 💡 이 값들은 비밀키가 아니라 "이 앱이 어떤 Firebase 프로젝트를 쓰는지" 알려주는 공개 식별자입니다.
> 실제 접근 제어는 3단계의 **Realtime Database 규칙**이 담당합니다.

---

## 2. Realtime Database 보안 규칙 설정

테스트 모드는 30일 후 만료되고, 누구나 전체 DB를 읽고 쓸 수 있어 위험합니다.
Firebase 콘솔 → Realtime Database → **규칙** 탭에서 아래로 교체하세요:

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

> 이 규칙은 "누구나 방 코드를 알면 그 방을 읽고 쓸 수 있다"는 뜻입니다.
> 인증 시스템이 없는 친구용 캐주얼 게임에 맞춘 간단한 신뢰 기반 규칙이며,
> 완전히 공개된 서비스로 운영할 계획이라면 Firebase Authentication을 추가해
> 더 엄격한 규칙을 쓰는 걸 권장합니다.

---

## 3. GitHub에 올리고 GitHub Pages로 배포하기

1. GitHub에서 새 저장소 생성 (예: `felt-blackjack`), Public으로 설정
2. 이 폴더의 파일 전체(`index.html`, `style.css`, `app.js`, `firebase-config.js` — **설정값을 넣은 상태로**)를 저장소에 push:
   ```bash
   git init
   git add .
   git commit -m "펠트 블랙잭 초기 배포"
   git branch -M main
   git remote add origin https://github.com/내계정/felt-blackjack.git
   git push -u origin main
   ```
3. GitHub 저장소 페이지 → **Settings → Pages**
4. **Source**를 `Deploy from a branch`로, **Branch**를 `main` / `/ (root)`로 설정 → **Save**
5. 1~2분 후 `https://내계정.github.io/felt-blackjack/` 주소로 접속 가능

이제 이 링크와 방 코드만 친구들에게 공유하면 함께 플레이할 수 있어요.

---

## 4. 게임 방법

1. 닉네임 입력 후 **새 테이블 만들기** (방 코드는 비워두면 자동 생성)
2. 방 코드를 친구에게 공유 → 친구는 같은 코드로 **기존 테이블 참가**
3. 2명 이상 모이면 아무나 **라운드 시작** 클릭
4. 각자 칩을 베팅 → 전원 베팅 완료 시 자동으로 카드 2장씩 딜링
5. 자기 차례에 **히트**(카드 추가) / **스탠드**(멈춤) 선택
6. 모두 끝나면 딜러가 자동으로 17 이상까지 진행 후 정산
7. **다음 라운드** 버튼으로 계속 플레이 (칩은 누적됨, 시작 칩 1,000)

규칙: 블랙잭(첫 2장 21) 배당 3:2, 일반 승리 1:1, 무승부 시 베팅 반환, 딜러는 소프트 17에서도 스탠드합니다.

---

## 5. 동작 원리 (궁금한 분들을 위해)

- 서버가 따로 없고, 방에 들어온 브라우저들이 Firebase의 같은 데이터 경로(`rooms/방코드`)를 구독합니다.
- 누군가 카드를 뽑거나 베팅하면 그 사람의 브라우저가 직접 DB를 업데이트하고, 나머지는 실시간으로 반영된 화면을 받아봅니다.
- "전원 베팅 완료 → 딜링" / "전원 턴 종료 → 딜러 진행"처럼 **누가 실행해도 상관없지만 딱 한 번만 실행돼야 하는 지점**은 Firebase `transaction()`으로 보호해서, 여러 명의 브라우저가 동시에 시도해도 단 하나만 성공하도록 만들었습니다.

## 6. 알려진 제한사항

- 참가자들이 서로를 신뢰한다는 전제의 캐주얼 프로젝트입니다. 브라우저 개발자 도구로 마음만 먹으면 데이터를 조작할 수 있어요 (친구들과 재미로 플레이하는 용도로 설계됨).
- 오래 플레이할수록 `log` 데이터가 계속 쌓입니다. 신경 쓰인다면 Firebase 콘솔에서 가끔 `rooms/방코드/log`를 지워주세요.
- 카드 애니메이션과 반응형 레이아웃은 최신 브라우저(Chrome, Edge, Safari 최신 버전) 기준으로 테스트했습니다.
