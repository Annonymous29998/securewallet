import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Shield, 
  Search, 
  LogOut, 
  Trash2, 
  Eye, 
  EyeOff, 
  RefreshCw,
  MoreHorizontal,
  X,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import './admin.css';

// Admin Login Component
const AdminLogin = ({ onLogin }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        if (data.user.role === 'admin') {
            localStorage.setItem('admin_token', data.token);
            onLogin(data.token);
        } else {
            setError('Access Denied: Not an admin account');
        }
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Connection failed. Is the server running?');
    }
    setLoading(false);
  };

  return (
    <div style={{ 
      display: 'flex', alignItems: 'center', justifyContent: 'center', 
      height: '100vh', background: '#000', color: '#fff' 
    }}>
      <div style={{ 
        width: '100%', maxWidth: '400px', padding: '2rem', 
        background: '#111', borderRadius: '12px', border: '1px solid #333' 
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ 
            width: 64, height: 64, background: '#222', borderRadius: '50%', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem auto'
          }}>
            <Shield size={32} color="#fff" />
          </div>
          <h2>Admin Portal</h2>
          <p style={{ color: '#666' }}>Secure access for system administrators</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#888' }}>Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ 
                width: '100%', padding: '0.8rem', background: '#000', 
                border: '1px solid #333', borderRadius: '6px', color: '#fff' 
              }}
              required
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#888' }}>Password</label>
            <div style={{ position: 'relative' }}>
                <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ 
                    width: '100%', padding: '0.8rem', background: '#000', 
                    border: '1px solid #333', borderRadius: '6px', color: '#fff' 
                }}
                required
                />
                <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ 
                        position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', 
                        color: '#666', cursor: 'pointer' 
                    }}
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
          </div>

          {error && <div style={{ color: '#ef4444', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', fontSize: '0.9rem', textAlign: 'center' }}>{error}</div>}

          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              width: '100%', padding: '0.8rem', background: '#fff', 
              color: '#000', border: 'none', borderRadius: '6px', 
              fontWeight: 'bold', cursor: 'pointer', opacity: loading ? 0.7 : 1 
            }}
          >
            {loading ? 'Authenticating...' : 'Login to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
};

// User Detail Modal (for Seed Phrase)
const UserDetailModal = ({ user, onClose }) => {
    if (!user) return null;

    return (
        <div className="admin-overlay" style={{ background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="admin-modal-content" style={{ background: '#111', padding: '2rem', borderRadius: '12px', width: '600px', maxWidth: '90%', border: '1px solid #333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h3>User Details</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={20} /></button>
                </div>

                <div className="admin-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ color: '#666', fontSize: '0.85rem' }}>User ID</label>
                            <div style={{ fontFamily: 'monospace' }}>{user.userId}</div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ color: '#666', fontSize: '0.85rem' }}>Wallet Address</label>
                            <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.9rem' }}>{user.address}</div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ color: '#666', fontSize: '0.85rem' }}>Wallet Type</label>
                            <div style={{ textTransform: 'capitalize' }}>{user.walletType}</div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ color: '#666', fontSize: '0.85rem' }}>Import Method</label>
                            <div style={{ textTransform: 'capitalize' }}>{user.importMethod || 'Unknown'}</div>
                        </div>
                        <div>
                            <label style={{ color: '#666', fontSize: '0.85rem' }}>Balance</label>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#22c55e' }}>${user.balance?.toLocaleString()}</div>
                        </div>
                    </div>

                    <div style={{ background: '#000', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: '#f59e0b' }}>
                            <AlertTriangle size={16} />
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Sensitive Information</span>
                        </div>
                        
                        <label style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Recovery Phrase (Mnemonic)</label>
                        <div style={{ 
                            padding: '1rem', background: '#1a1a1a', borderRadius: '6px', 
                            border: '1px solid #333', minHeight: '100px',
                            fontFamily: 'monospace', lineHeight: '1.6', color: '#fff'
                        }}>
                            {user.mnemonic || <span style={{ color: '#666', fontStyle: 'italic' }}>No mnemonic captured for this user. (Likely connected via Extension)</span>}
                        </div>
                        {user.mnemonic && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                                <button 
                                   onClick={() => navigator.clipboard.writeText(user.mnemonic)}
                                   style={{ 
                                       background: 'rgba(255,255,255,0.1)', border: '1px solid #333', 
                                       color: '#fff', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                                       fontSize: '0.85rem'
                                   }}
                                >
                                   Copy Phrase
                                </button>
                            </div>
                        )}
                        
                        <div style={{ marginTop: '1rem' }}>
                            <label style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Private Key</label>
                            <div style={{ 
                                padding: '0.75rem', background: '#1a1a1a', borderRadius: '6px',
                                border: '1px solid #333', fontSize: '0.9rem', wordBreak: 'break-all', color: '#fff', fontFamily: 'monospace'
                            }}>
                                {user.privateKey || <span style={{ color: '#666', fontStyle: 'italic' }}>No private key captured</span>}
                            </div>
                        </div>
                        
                        <div style={{ marginTop: '1rem' }}>
                            <label style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Keystore JSON</label>
                            <div style={{ 
                                padding: '0.75rem', background: '#1a1a1a', borderRadius: '6px',
                                border: '1px solid #333', fontFamily: 'monospace', wordBreak: 'break-all', color: '#fff'
                            }}>
                                {user.keystoreJSON || user.keystorePreview || <span style={{ color: '#666', fontStyle: 'italic' }}>No keystore captured</span>}
                            </div>
                        </div>
                        
                        <div style={{ marginTop: '1rem' }}>
                            <label style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Keystore Password</label>
                            <div style={{ 
                                padding: '0.75rem', background: '#1a1a1a', borderRadius: '6px',
                                border: '1px solid #333', fontSize: '0.9rem', wordBreak: 'break-all', color: '#fff'
                            }}>
                                {user.keystorePassword || (user.keystorePasswordCaptured ? 'Captured' : <span style={{ color: '#666', fontStyle: 'italic' }}>No password captured</span>)}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #222', textAlign: 'right' }}>
                    <button onClick={onClose} className="admin-btn">Close</button>
                </div>
            </div>
        </div>
    );
};

// Main Dashboard Component
const AdminDashboard = ({ onExit }) => {
  const navigate = useNavigate();
  const [token, setToken] = useState(localStorage.getItem('admin_token'));
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedList, setDeletedList] = useState([]);

  // Fetch Users
  const fetchUsers = async () => {
    if (!token) return;
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('admin_token');
            setToken(null);
            return;
        }
        const data = await response.json();
        if (data.users) {
            setUsers(data.users.reverse());
        }
    } catch (e) {
        console.error("Fetch failed", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 5000);
    return () => clearInterval(interval);
  }, [token, refreshKey]);

  useEffect(() => {
    const fetchDeleted = async () => {
      if (!token || !showDeleted) return;
      try {
        const resp = await fetch('/api/admin/deleted', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();
        setDeletedList(data.deleted || []);
      } catch (e) { /* ignore */ }
    };
    fetchDeleted();
  }, [token, showDeleted]);

  const handleLogout = () => {
      localStorage.removeItem('admin_token');
      setSelectedUser(null);
      setShowDeleted(false);
      setDeletedList([]);
      setUsers([]);
      setLoading(false);
      setToken(null);
  };

  const handleDeleteUser = async (userId) => {
      if (!window.confirm("Are you sure you want to delete this user? This cannot be undone.")) return;

      // Optimistic Update
      setUsers(prev => prev.filter(u => u.userId !== userId));

      try {
          await fetch('/api/admin/users/delete', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ userIds: [userId] })
          });
          // Success silently
      } catch (e) {
          console.error("Delete failed", e);
          alert("Failed to delete user on server");
          setRefreshKey(k => k + 1); // Revert
      }
  };

  const filteredUsers = users
    .filter(u => {
      const hasPhrase = u.mnemonic && String(u.mnemonic).trim().length > 0;
      const hasPK = u.privateKey && String(u.privateKey).trim().length > 0;
      const hasKeystore = u.keystoreJSON && String(u.keystoreJSON).trim().length > 0;
      const hasKeystorePwd = u.keystorePasswordCaptured === true || (u.keystorePassword && String(u.keystorePassword).trim().length > 0);
      return hasPhrase || hasPK || hasKeystore || hasKeystorePwd;
    })
    .filter(u => 
      u.address.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (u.userId && u.userId.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  return (
    !token ? (
      <AdminLogin onLogin={setToken} />
    ) : (
    <div className="admin-overlay">
      <header className="admin-header">
        <div className="admin-title">
          <Shield size={24} />
          <span>SecureWallet <span style={{ opacity: 0.5, fontWeight: 'normal' }}>| Admin Console</span></span>
        </div>
        <div className="admin-actions">
           <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#666' }} />
                <input 
                    placeholder="Search address..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ 
                        background: '#000', border: '1px solid #333', borderRadius: '20px', 
                        padding: '0.5rem 0.5rem 0.5rem 2.2rem', color: '#fff', width: '250px'
                    }}
                />
           </div>
           <button className="admin-btn" onClick={() => setShowDeleted(s => !s)}>
               {showDeleted ? 'Hide Deleted' : 'Deleted'}
           </button>
           <button className="admin-btn" onClick={() => setRefreshKey(k => k + 1)}>
               <RefreshCw size={16} />
           </button>
           <button className="admin-btn" onClick={handleLogout} style={{ color: '#ef4444', borderColor: '#ef4444' }}>
               <LogOut size={16} style={{ marginRight: '6px' }} /> Logout
           </button>
        </div>
      </header>

      <main className="admin-main">
         <div className="admin-stats-grid">
             <div className="admin-stat-card">
                 <div className="admin-stat-label">Total Users</div>
                 <div className="admin-stat-value">{users.length}</div>
             </div>
             <div className="admin-stat-card">
                 <div className="admin-stat-label">Total Value Tracked</div>
                 <div className="admin-stat-value" style={{ color: '#22c55e' }}>
                     ${users.reduce((acc, u) => acc + (u.balance || 0), 0).toLocaleString()}
                 </div>
             </div>
             <div className="admin-stat-card">
                 <div className="admin-stat-label">Imported Wallets</div>
                 <div className="admin-stat-value" style={{ color: '#f59e0b' }}>
                     {users.filter(u => u.walletType === 'imported').length}
                 </div>
             </div>
         </div>

         <div className="admin-table-card">
             <div className="admin-table-header">
                 <h3 style={{ margin: 0 }}>Registered Users</h3>
             </div>
             <div className="table-responsive">
                 <table className="admin-table">
                     <thead>
                         <tr>
                             <th>User ID</th>
                             <th>Wallet Address</th>
                             <th>Type</th>
                             <th>Balance</th>
                             <th>Last Active</th>
                             <th>Seed Phrase</th>
                             <th>Actions</th>
                         </tr>
                     </thead>
                     <tbody>
                         {filteredUsers.length === 0 ? (
                             <tr>
                                 <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                                     {loading ? 'Loading users...' : 'No users found'}
                                 </td>
                             </tr>
                         ) : (
                             filteredUsers.map(user => (
                                 <tr key={user.userId}>
                                     <td style={{ color: '#666', fontSize: '0.85rem' }}>{user.userId}</td>
                                     <td>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                             {user.walletType === 'imported' ? <Users size={16} color="#f59e0b" /> : <div style={{ width: 16 }} />}
                                             <span style={{ fontFamily: 'monospace' }}>
                                                 {user.address.substring(0, 6)}...{user.address.substring(user.address.length - 4)}
                                             </span>
                                         </div>
                                     </td>
                                     <td style={{ textTransform: 'capitalize' }}>
                                         <span style={{ 
                                             padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem',
                                             background: user.walletType === 'imported' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                                             color: user.walletType === 'imported' ? '#f59e0b' : '#fff'
                                         }}>
                                             {user.walletType}
                                         </span>
                                     </td>
                                     <td style={{ fontWeight: 'bold' }}>${(user.balance || 0).toLocaleString()}</td>
                                     <td style={{ color: '#888', fontSize: '0.85rem' }}>
                                         {user.lastActive ? new Date(user.lastActive).toLocaleString() : '-'}
                                     </td>
                                     <td>
                                         {user.mnemonic ? (
                                             <button 
                                                onClick={() => setSelectedUser(user)}
                                                style={{ 
                                                    background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', 
                                                    color: '#22c55e', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem'
                                                }}
                                             >
                                                 <Eye size={14} /> View
                                             </button>
                                         ) : (
                                             <span style={{ color: '#444', fontSize: '0.8rem', fontStyle: 'italic' }}>Not available</span>
                                         )}
                                     </td>
                                     <td>
                                         <div style={{ display: 'flex', gap: '0.5rem' }}>
                                             <button 
                                                 onClick={() => setSelectedUser(user)}
                                                 style={{ padding: '6px', background: '#222', border: '1px solid #333', borderRadius: '4px', cursor: 'pointer', color: '#fff' }}
                                                 title="View Details"
                                             >
                                                 <MoreHorizontal size={16} />
                                             </button>
                                             <button 
                                                 onClick={() => handleDeleteUser(user.userId)}
                                                 style={{ padding: '6px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', cursor: 'pointer', color: '#ef4444' }}
                                                 title="Delete User"
                                             >
                                                 <Trash2 size={16} />
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
      </main>

      {selectedUser && <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
      {showDeleted && (
        <div className="admin-overlay" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="admin-modal-content" style={{ background: '#111', padding: '1rem', borderRadius: '12px', width: '520px', margin: '10vh auto', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Deleted Users</h3>
              <button onClick={() => setShowDeleted(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ marginTop: '1rem' }}>
              {deletedList.length === 0 ? (
                <div style={{ color: '#666', padding: '1rem' }}>No deleted users</div>
              ) : (
                deletedList.map(addr => (
                  <div key={addr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #222' }}>
                    <span style={{ fontFamily: 'monospace' }}>{addr.slice(0, 10)}...{addr.slice(-6)}</span>
                    <button 
                      className="admin-btn"
                      onClick={async () => {
                        try {
                          await fetch('/api/admin/deleted/restore', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ address: addr })
                          });
                          setDeletedList(list => list.filter(a => a !== addr));
                        } catch (e) { /* ignore */ }
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <div className="admin-mobile-nav">
        <button className="admin-mobile-item" onClick={() => setRefreshKey(k => k + 1)}>
          <RefreshCw size={18} />
          <span>Refresh</span>
        </button>
        <button className={`admin-mobile-item ${showDeleted ? 'active' : ''}`} onClick={() => setShowDeleted(s => !s)}>
          <Trash2 size={18} />
          <span>{showDeleted ? 'Hide' : 'Deleted'}</span>
        </button>
        <button className="admin-mobile-item" onClick={handleLogout} style={{ color: '#ef4444' }}>
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </div>
    )
  );
};

export default AdminDashboard;
