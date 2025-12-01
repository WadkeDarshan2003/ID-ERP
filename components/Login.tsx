import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MOCK_USERS } from '../constants';
import { User, Role } from '../types';
import { Lock, User as UserIcon } from 'lucide-react';

const Login: React.FC = () => {
  const { login } = useAuth();

  const handleLogin = (user: User) => {
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
        <div className="md:w-1/2 p-12 bg-white">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome Back</h2>
          <p className="text-gray-500 mb-8">Select a demo account to sign in:</p>

          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Admin</span>
              {MOCK_USERS.filter(u => u.role === Role.ADMIN).map(user => (
                <UserButton key={user.id} user={user} onClick={() => handleLogin(user)} />
              ))}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Designers</span>
              {MOCK_USERS.filter(u => u.role === Role.DESIGNER).slice(0, 2).map(user => (
                <UserButton key={user.id} user={user} onClick={() => handleLogin(user)} />
              ))}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Vendors</span>
              {MOCK_USERS.filter(u => u.role === Role.VENDOR).slice(0, 1).map(user => (
                <UserButton key={user.id} user={user} onClick={() => handleLogin(user)} />
              ))}
            </div>

             <div className="space-y-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Clients</span>
              {MOCK_USERS.filter(u => u.role === Role.CLIENT).slice(0, 1).map(user => (
                <UserButton key={user.id} user={user} onClick={() => handleLogin(user)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const UserButton = ({ user, onClick }: { user: User, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
  >
    <img src={user.avatar} alt="" className="w-10 h-10 rounded-full bg-gray-200" />
    <div>
      <h3 className="font-semibold text-gray-900 group-hover:text-blue-700">{user.name}</h3>
      <p className="text-xs text-gray-500">{user.email}</p>
    </div>
    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
       <span className="text-xs font-medium text-blue-600">Login &rarr;</span>
    </div>
  </button>
);

export default Login;