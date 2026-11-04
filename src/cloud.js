/* ক্লাউড স্তর: Firebase Authentication (ইমেইল + পাসওয়ার্ড) এবং Firestore (অফলাইন ক্যাশ সহ)।
   অ্যাপের বাকি অংশ শুধু window.Cloud-এর এই ফাংশনগুলো ব্যবহার করে; Firebase সরাসরি জানে না।
   www/firebase-config.js ফাঁকা থাকলে Cloud.configured = false, তখন অ্যাপ আগের মতো শুধু ফোনে চলে। */
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut as fbSignOut
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  writeBatch, waitForPendingWrites, terminate, clearIndexedDbPersistence
} from 'firebase/firestore';

const cfg = window.FIREBASE_CONFIG || {};
const configured = !!(cfg.apiKey && cfg.projectId && cfg.appId);
const COLLS = ['cases', 'hearings', 'clients', 'fees'];

if (!configured) {
  window.Cloud = { configured: false };
} else {
  const app = initializeApp(cfg);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
    experimentalAutoDetectLongPolling: true
  });

  const clean = o => JSON.parse(JSON.stringify(o));
  const timeout = (p, ms, code = 'app/timeout') => Promise.race([
    p, new Promise((_, rej) => setTimeout(() => rej({ code }), ms))
  ]);
  const genCode = () => {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return Array.from(b, x => A[x % A.length]).join('');
  };
  const requireUser = () => { if (!auth.currentUser) throw { code: 'auth/no-user' }; return auth.currentUser; };

  window.Cloud = {
    configured: true,

    onAuth(cb) {
      return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null));
    },
    signIn: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
    signUp: (email, pw) => createUserWithEmailAndPassword(auth, email, pw),
    resetPassword: email => sendPasswordResetEmail(auth, email),

    async signOut() {
      await fbSignOut(auth);
      try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { /* ignore */ }
    },

    /* এই ব্যবহারকারী কোন চেম্বারের সদস্য — না থাকলে null, সরিয়ে দেওয়া হলে {removed:true} */
    async getProfile(uid) {
      const u = await timeout(getDoc(doc(db, 'users', uid)), 15000);
      if (!u.exists()) return null;
      const chamberId = u.data().chamberId;
      const m = await getDoc(doc(db, 'chambers', chamberId, 'members', uid)).catch(e => {
        if (e && e.code === 'permission-denied') return null; throw e;
      });
      if (!m || !m.exists()) return { removed: true };
      const ch = await getDoc(doc(db, 'chambers', chamberId));
      const role = m.data().role;
      return {
        chamberId, role, name: m.data().name || u.data().name || '',
        chamberName: ch.exists() ? ch.data().name : '', code: role === 'admin' && ch.exists() ? ch.data().code : ''
      };
    },

    async createChamber({ chamberName, userName }) {
      const user = requireUser(), code = genCode();
      const cref = doc(collection(db, 'chambers'));
      await timeout(setDoc(cref, { name: chamberName, ownerUid: user.uid, code, createdAt: Date.now() }), 20000);
      await timeout(setDoc(doc(db, 'chambers', cref.id, 'members', user.uid), { role: 'admin', name: userName, email: user.email, joinedAt: Date.now() }), 20000);
      await timeout(setDoc(doc(db, 'joinCodes', code), { chamberId: cref.id, ownerUid: user.uid }), 20000);
      await timeout(setDoc(doc(db, 'users', user.uid), { chamberId: cref.id, name: userName, email: user.email }), 20000);
      return { chamberId: cref.id, role: 'admin', name: userName, chamberName, code };
    },

    async joinChamber({ code, userName }) {
      const user = requireUser();
      code = String(code || '').trim().toUpperCase();
      const c = await timeout(getDoc(doc(db, 'joinCodes', code)), 20000);
      if (!c.exists()) throw { code: 'app/bad-code' };
      const chamberId = c.data().chamberId;
      await timeout(setDoc(doc(db, 'chambers', chamberId, 'members', user.uid), { role: 'clerk', name: userName, email: user.email, code, joinedAt: Date.now() }), 20000);
      await timeout(setDoc(doc(db, 'users', user.uid), { chamberId, name: userName, email: user.email }), 20000);
      const ch = await getDoc(doc(db, 'chambers', chamberId));
      return { chamberId, role: 'clerk', name: userName, chamberName: ch.exists() ? ch.data().name : '', code: '' };
    },

    /* handlers: onDocs(coll, upserts[], removedIds[], initial), onReady(), onStatus({pending}), onError(err) */
    subscribe(chamberId, h) {
      const unsubs = [], first = new Set(), server = new Set(), pend = {};
      for (const c of COLLS) {
        unsubs.push(onSnapshot(collection(db, 'chambers', chamberId, c), { includeMetadataChanges: true }, snap => {
          const up = [], rem = [];
          snap.docChanges().forEach(ch => {
            if (ch.type === 'removed') rem.push(ch.doc.id);
            else up.push({ ...ch.doc.data(), id: ch.doc.id });
          });
          const initial = !first.has(c);
          first.add(c);
          // সার্ভার থেকে প্রথম পূর্ণ তথ্য এলে অ্যাপ নিজের ক্যাশের সাথে মিলিয়ে নেবে (ids = সার্ভারের সব ডকুমেন্টের আইডি)
          const fresh = !snap.metadata.fromCache && !server.has(c);
          if (fresh) server.add(c);
          pend[c] = snap.metadata.hasPendingWrites;
          if (initial || fresh || up.length || rem.length) {
            h.onDocs(c, up, rem, { reconcile: fresh, ids: snap.docs.map(d => d.id) });
          }
          if (initial && first.size === COLLS.length) h.onReady();
          h.onStatus({ pending: Object.values(pend).some(Boolean), fromCache: snap.metadata.fromCache });
        }, err => h.onError(err)));
      }
      return () => unsubs.forEach(u => u());
    },

    /* ops: [{c, put:obj} | {c, del:id}] */
    async write(chamberId, ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        for (const o of ops.slice(i, i + 400)) {
          const ref = doc(db, 'chambers', chamberId, o.c, o.put ? o.put.id : o.del);
          if (o.put) b.set(ref, clean(o.put)); else b.delete(ref);
        }
        await b.commit();
      }
    },

    flush: () => waitForPendingWrites(db),

    async members(chamberId) {
      const s = await timeout(getDocs(collection(db, 'chambers', chamberId, 'members')), 15000);
      return s.docs.map(d => ({ uid: d.id, ...d.data() }));
    },
    async removeMember(chamberId, uid) {
      await timeout(deleteDoc(doc(db, 'chambers', chamberId, 'members', uid)), 15000);
    },
    async newCode(chamberId, oldCode) {
      const user = requireUser(), code = genCode();
      await timeout(setDoc(doc(db, 'joinCodes', code), { chamberId, ownerUid: user.uid }), 15000);
      await timeout(updateDoc(doc(db, 'chambers', chamberId), { code }), 15000);
      if (oldCode) { try { await deleteDoc(doc(db, 'joinCodes', oldCode)); } catch (e) { /* ignore */ } }
      return code;
    }
  };
}
