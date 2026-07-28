// ============================================================
// Firebase 설정
// README.md의 "1. Firebase 프로젝트 만들기" 단계를 따라
// Firebase 콘솔(console.firebase.google.com)에서 발급받은 값을
// 아래 firebaseConfig 객체에 그대로 붙여넣으세요.
//
// 이 값들은 "비밀키"가 아니라 클라이언트 식별용 공개 설정입니다.
// (실제 보안은 Realtime Database 규칙에서 관리합니다 — README 참고)
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDM_uFj1KL_-VXE9h3QAUG7k9ggZ2_KgLE",
  authDomain: "ather-4879f.firebaseapp.com",
  projectId: "ather-4879f",
  storageBucket: "ather-4879f.firebasestorage.app",
  messagingSenderId: "673788727472",
  appId: "1:673788727472:web:5381718e9b82dd5e97eb75"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
