import React from 'react';
import { User, Role } from '../types';
import { Mail, Phone, Building2 } from 'lucide-react';

interface PeopleListProps {
  users: User[];
  roleFilter: Role | 'All';
}

const PeopleList: React.FC<PeopleListProps> = ({ users, roleFilter }) => {
  const filteredUsers = roleFilter === 'All' 
    ? users.filter(u => u.role !== Role.ADMIN) // Hide admin usually
    : users.filter(u => u.role === roleFilter);

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          {roleFilter === 'All' ? 'Directory' : `${roleFilter}s`}
        </h2>
        <button className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
          Add {roleFilter === 'All' ? 'Person' : roleFilter}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map(user => (
          <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm" />
                <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wide
                  ${user.role === Role.CLIENT ? 'bg-blue-100 text-blue-700' : 
                    user.role === Role.VENDOR ? 'bg-orange-100 text-orange-700' : 
                    'bg-purple-100 text-purple-700'}`}>
                  {user.role}
                </span>
              </div>
              
              <div className="mt-4">
                <h3 className="text-lg font-bold text-gray-900">{user.name}</h3>
                {user.company && (
                  <p className="text-sm font-medium text-gray-500 flex items-center gap-1 mt-1">
                    <Building2 className="w-3 h-3" /> {user.company}
                  </p>
                )}
                {user.specialty && (
                   <p className="text-xs text-gray-400 mt-1">{user.specialty}</p>
                )}
              </div>

              <div className="mt-6 space-y-2 border-t border-gray-100 pt-4">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${user.email}`} className="hover:text-blue-600 truncate">{user.email}</a>
                </div>
                {user.phone && (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{user.phone}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-between items-center">
              <button className="text-xs font-medium text-gray-500 hover:text-gray-900">View Profile</button>
              <button className="text-xs font-medium text-blue-600 hover:text-blue-800">Assign to Project</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PeopleList;
