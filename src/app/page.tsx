'use client';

import { useState, useEffect } from 'react';
import { db, auth, googleProvider } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';

const ROOT_EMAILS = ['johsua092@gmail.com'];

export default function ApiDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && ROOT_EMAILS.some(e => currentUser.email?.includes('johsua092') || currentUser.email === e)) {
        // Fetch keys
        const q = query(collection(db, 'api_keys'), orderBy('createdAt', 'desc'));
        const unsubDb = onSnapshot(q, (snapshot) => {
          setKeys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setLoading(false);
        });
        return () => unsubDb();
      } else {
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  const generateKey = async () => {
    if (!newKeyName.trim()) return alert("Enter a name for the key");
    const randomStr = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const keyString = `aikernel-${randomStr}`;
    
    await setDoc(doc(db, 'api_keys', keyString), {
      name: newKeyName,
      active: true,
      requestCount: 0,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      createdBy: user?.email,
    });
    setNewKeyName('');
  };

  const toggleKey = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, 'api_keys', id), { active: !currentStatus });
  };

  const deleteKey = async (id: string) => {
    if (confirm("Are you sure you want to delete this API Key?")) {
      await deleteDoc(doc(db, 'api_keys', id));
    }
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Loading...</div>;

  if (!user || !ROOT_EMAILS.some(e => user.email?.includes('johsua092') || user.email === e)) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">AI API Provider</h1>
          <p className="text-zinc-400 mb-8">Login as ROOT to manage custom API keys.</p>
          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">API Keys Console</h1>
            <p className="text-zinc-400">Manage API keys and monitor usage</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-zinc-400">{user.email}</div>
            <button onClick={() => signOut(auth)} className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-sm transition-colors">
              Sign Out
            </button>
          </div>
        </div>

        {/* Generate New Key */}
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Create new secret key</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key Name (e.g., Untuk Budi, Proyek X)"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all text-sm"
              onKeyDown={(e) => e.key === 'Enter' && generateKey()}
            />
            <button
              onClick={generateKey}
              disabled={!newKeyName.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Key
            </button>
          </div>
        </div>

        {/* Keys Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/50">
                <th className="px-6 py-4 text-sm font-medium text-zinc-400">NAME</th>
                <th className="px-6 py-4 text-sm font-medium text-zinc-400">SECRET KEY</th>
                <th className="px-6 py-4 text-sm font-medium text-zinc-400">USAGE</th>
                <th className="px-6 py-4 text-sm font-medium text-zinc-400">CREATED</th>
                <th className="px-6 py-4 text-sm font-medium text-zinc-400">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500 text-sm">
                    No API keys found. Create one above.
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr key={key.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors group">
                    <td className="px-6 py-4 font-medium text-zinc-200">{key.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-zinc-950 px-2 py-1 rounded text-zinc-300 select-all border border-zinc-800">
                          {key.id}
                        </code>
                        {!key.active && <span className="text-[10px] uppercase bg-red-500/10 text-red-400 px-2 py-0.5 rounded font-bold">Revoked</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-zinc-200">{key.requestCount} requests</span>
                        {key.lastUsedAt && <span className="text-xs">Last: {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => toggleKey(key.id, key.active)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            key.active ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                          }`}
                        >
                          {key.active ? 'Revoke' : 'Enable'}
                        </button>
                        <button
                          onClick={() => deleteKey(key.id)}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
