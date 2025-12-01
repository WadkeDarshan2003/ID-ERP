import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MOCK_USERS } from '../constants';
import { User, Role } from '../types';
import { Lock, User as UserIcon, ArrowRight } from 'lucide-react';

interface LoginProps {
  users?: User[];
}

const Login: React.FC<LoginProps> = ({ users = MOCK_USERS }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleCredentialsLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (user) {
      login(user);
      setError('');
    } else {
      setError('Invalid credentials. Check email or password (Aadhar).');
    }
  };

  const handleDemoLogin = (user: User) => {
    login(user);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full overflow-hidden flex flex-col md:flex-row">
        {/* Left Side - Brand */}
        <div className="md:w-1/2 bg-gray-900 p-12 text-white flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-gray-900 font-bold text-2xl mb-6">L</div>
            <h1 className="text-4xl font-bold mb-4">LuxeSpace ERP</h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Manage your interior design projects, clients, and vendors in one seamless platform.
            </p>
          </div>
          <div className="mt-12">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Lock className="w-4 h-4" />
              <span>Secure Role-Based Access</span>
            </div>
          </div>
        </div>

        {/* Right Side - Login Options */}
        <div className="md:w-1/2 p-12 bg-white flex flex-col justify-center">
          
          {/* Credential Login Form */}
          <div className="mb-10">
             <h2 className="text-2xl font-bold text-gray-800 mb-6">Sign In</h2>
             <form onSubmit={handleCredentialsLogin} className="space-y-4">
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Login ID (Email)</label>
                   <input 
                     type="email" 
                     className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                     placeholder="Enter your email"
                     value={email}
                     onChange={e => setEmail(e.target.value)}
                   />
                </div>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Password (Aadhar Number)</label>
                   <input 
                     type="password" 
                     className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                     placeholder="Enter password"
                     value={password}
                     onChange={e => setPassword(e.target.value)}
                   />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                   Login <ArrowRight className="w-4 h-4" />
                </button>
             </form>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or use a demo account</span>
            </div>
          </div>

          <div className="space-y-3 h-48 overflow-y-auto pr-2 custom-scrollbar">
            {/* Demo Accounts List */}
             {users.filter(u => MOCK_USERS.some(m => m.id === u.id)).map(user => (
               <button 
                key={user.id}
                onClick={() => handleDemoLogin(user)}
                className="w-full flex items-center gap-3 p-2 rounded-lg border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all text-left group"
              >
                <img src={user.avatar} alt="" className="w-8 h-8 rounded-full bg-gray-200" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{user.name}</h3>
                    <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-1 rounded">{user.role}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              </button>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;