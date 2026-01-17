// Firebase Configuration for 아울도어
// CDN 방식으로 Firebase 사용

// Firebase 설정 - config.js에서 불러오기
const firebaseConfig = typeof CONFIG !== 'undefined' ? CONFIG.firebase : {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: ""
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// Firebase 서비스 인스턴스
const auth = firebase.auth();
const db = firebase.firestore();
const analytics = firebase.analytics();
const storage = typeof firebase.storage === 'function' ? firebase.storage() : null;

// 인증 상태 관리
let currentUser = null;

// 인증 상태 변경 리스너
auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateAuthUI(user);
    console.log('Auth state changed:', user ? user.email : 'logged out');
});

// UI 업데이트 함수
function updateAuthUI(user) {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const mypageBtn = document.getElementById('mypage-btn');

    if (user) {
        // 로그인 상태
        if (loginBtn) {
            const userName = user.displayName || user.email.split('@')[0];
            loginBtn.textContent = userName + '님';
            loginBtn.setAttribute('data-logged-in', 'true');
        }
        if (mypageBtn) {
            mypageBtn.classList.remove('hidden');
        }
        if (signupBtn) {
            signupBtn.textContent = '로그아웃';
            signupBtn.setAttribute('data-logged-in', 'true');
        }
    } else {
        // 로그아웃 상태 - 기본 상태로 복원
        if (loginBtn) {
            loginBtn.textContent = '로그인';
            loginBtn.removeAttribute('data-logged-in');
        }
        if (mypageBtn) {
            mypageBtn.classList.add('hidden');
        }
        if (signupBtn) {
            signupBtn.textContent = '회원가입';
            signupBtn.removeAttribute('data-logged-in');
        }
    }
}

// ==================== 인증 함수 ====================

// 이메일 회원가입
async function signUpWithEmail(email, password, name) {
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // 사용자 프로필 업데이트
        await user.updateProfile({ displayName: name });

        // Firestore에 사용자 정보 저장
        await db.collection('users').doc(user.uid).set({
            email: email,
            name: name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            points: 0,
            coupons: []
        });

        console.log('회원가입 성공:', user.email);
        return { success: true, user };
    } catch (error) {
        console.error('회원가입 실패:', error);
        return { success: false, error: error.message };
    }
}

// 이메일 로그인
async function signInWithEmail(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        console.log('로그인 성공:', userCredential.user.email);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error('로그인 실패:', error);
        return { success: false, error: error.message };
    }
}

// Google 로그인
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({
            prompt: 'select_account'
        });

        // popup 시도
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // 신규 사용자면 Firestore에 정보 저장
        await saveGoogleUserToFirestore(user);

        console.log('Google 로그인 성공:', user.email);
        return { success: true, user };
    } catch (error) {
        console.error('Google 로그인 실패:', error);

        // 도메인 미승인 오류 시 안내 메시지
        if (error.code === 'auth/unauthorized-domain') {
            return {
                success: false,
                error: 'Google 로그인을 사용하려면 Firebase Console에서 현재 도메인을 승인해야 합니다.\n\n' +
                       '1. Firebase Console (console.firebase.google.com) 접속\n' +
                       '2. 프로젝트 선택 → Authentication → Settings\n' +
                       '3. Authorized domains에 "127.0.0.1" 또는 "localhost" 추가\n\n' +
                       '지금은 이메일 로그인을 사용해 주세요.'
            };
        }

        return { success: false, error: error.message };
    }
}

// Google 사용자 Firestore 저장 (공통 함수)
async function saveGoogleUserToFirestore(user) {
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
        await db.collection('users').doc(user.uid).set({
            email: user.email,
            name: user.displayName,
            photoURL: user.photoURL,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            points: 0,
            coupons: []
        });
    }
}

// Redirect 결과 처리 (페이지 로드 시 자동 실행)
auth.getRedirectResult().then(async (result) => {
    if (result.user) {
        await saveGoogleUserToFirestore(result.user);
        console.log('Google Redirect 로그인 성공:', result.user.email);
    }
}).catch((error) => {
    console.error('Google Redirect 결과 처리 실패:', error);
});

// 로그아웃
async function signOut() {
    try {
        await auth.signOut();
        console.log('로그아웃 성공');
        return { success: true };
    } catch (error) {
        console.error('로그아웃 실패:', error);
        return { success: false, error: error.message };
    }
}

// ==================== 주문 관련 함수 ====================

// 주문 생성
async function createOrder(orderData) {
    try {
        const orderId = 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const order = {
            orderId: orderId,
            userId: currentUser ? currentUser.uid : 'guest',
            userEmail: currentUser ? currentUser.email : orderData.email,
            ...orderData,
            status: 'pending', // pending, paid, confirmed, shipping, completed, cancelled
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('orders').doc(orderId).set(order);
        console.log('주문 생성 성공:', orderId);
        return { success: true, orderId, order };
    } catch (error) {
        console.error('주문 생성 실패:', error);
        return { success: false, error: error.message };
    }
}

// 주문 상태 업데이트
async function updateOrderStatus(orderId, status, paymentInfo = {}) {
    try {
        await db.collection('orders').doc(orderId).update({
            status: status,
            paymentInfo: paymentInfo,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('주문 상태 업데이트:', orderId, status);
        return { success: true };
    } catch (error) {
        console.error('주문 상태 업데이트 실패:', error);
        return { success: false, error: error.message };
    }
}

// 사용자 주문 목록 조회
async function getUserOrders(userId) {
    try {
        const snapshot = await db.collection('orders')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();

        const orders = [];
        snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
        return { success: true, orders };
    } catch (error) {
        console.error('주문 목록 조회 실패:', error);
        return { success: false, error: error.message };
    }
}

// ==================== 문의 관련 함수 ====================

// 문의 생성
async function createInquiry(inquiryData) {
    try {
        const inquiryId = 'INQ_' + Date.now();

        const inquiry = {
            inquiryId: inquiryId,
            userId: currentUser ? currentUser.uid : 'guest',
            ...inquiryData,
            status: 'pending', // pending, answered
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('inquiries').doc(inquiryId).set(inquiry);
        console.log('문의 생성 성공:', inquiryId);
        return { success: true, inquiryId };
    } catch (error) {
        console.error('문의 생성 실패:', error);
        return { success: false, error: error.message };
    }
}

// ==================== 견적 요청 함수 ====================

// 견적 요청 저장
async function createQuoteRequest(quoteData) {
    try {
        const quoteId = 'QT_' + Date.now();

        const quote = {
            quoteId: quoteId,
            ...quoteData,
            status: 'pending', // pending, contacted, completed
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('quotes').doc(quoteId).set(quote);
        console.log('견적 요청 성공:', quoteId);
        return { success: true, quoteId };
    } catch (error) {
        console.error('견적 요청 실패:', error);
        return { success: false, error: error.message };
    }
}

// ==================== 상품 관련 함수 ====================

// 상품 목록 조회
async function getProducts() {
    try {
        const snapshot = await db.collection('products').orderBy('order').get();
        const products = [];
        snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
        return { success: true, products };
    } catch (error) {
        console.error('상품 목록 조회 실패:', error);
        return { success: false, error: error.message };
    }
}

// 상품 상세 조회
async function getProduct(productId) {
    try {
        const doc = await db.collection('products').doc(productId).get();
        if (doc.exists) {
            return { success: true, product: { id: doc.id, ...doc.data() } };
        } else {
            return { success: false, error: '상품을 찾을 수 없습니다.' };
        }
    } catch (error) {
        console.error('상품 조회 실패:', error);
        return { success: false, error: error.message };
    }
}

// ==================== 초기 상품 데이터 등록 ====================

// 초기 상품 데이터 (한 번만 실행)
async function initializeProducts() {
    const products = [
        {
            id: 'product_1',
            name: '프리미엄 현관중문',
            category: '현관중문',
            price: 1200000,
            originalPrice: 1500000,
            description: '단열 + 방음 + 보안',
            badge: 'BEST',
            image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=450&fit=crop',
            order: 1
        },
        {
            id: 'product_2',
            name: '3연동 중문',
            category: '중문',
            price: 800000,
            originalPrice: 1000000,
            description: '슬라이딩 시스템',
            badge: '',
            image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=450&fit=crop',
            order: 2
        },
        {
            id: 'product_3',
            name: '4연동 중문',
            category: '중문',
            price: 1000000,
            originalPrice: 1200000,
            description: '프리미엄 슬라이딩',
            badge: 'NEW',
            image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=600&h=450&fit=crop',
            order: 3
        },
        {
            id: 'product_4',
            name: '자동 중문 시스템',
            category: '자동중문',
            price: 1500000,
            originalPrice: 1800000,
            description: '센서 + 자동개폐',
            badge: 'HOT',
            image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&h=450&fit=crop',
            order: 4
        }
    ];

    for (const product of products) {
        await db.collection('products').doc(product.id).set(product);
    }
    console.log('상품 데이터 초기화 완료');
}

console.log('Firebase 초기화 완료 - 아울도어');
