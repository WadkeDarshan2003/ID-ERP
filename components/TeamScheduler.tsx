import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar,
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  MapPin, 
  Users, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  MoreVertical,
  CalendarDays,
  ExternalLink,
  LayoutGrid,
  List
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { WorkScheduleItem, ScheduleItemType, ScheduleItemStatus, User, Role } from '../types';
import { 
  format, 
  addDays, 
  subDays, 
  startOfDay, 
  isSameDay, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval,
  isToday,
  addMonths,
  subMonths,
  setHours,
  setMinutes,
  differenceInMinutes,
  startOfHour,
  addHours,
  parseISO
} from 'date-fns';

const TeamScheduler: React.FC = () => {
  const { userProfile, user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date()); 
  const [scheduleItems, setScheduleItems] = useState<WorkScheduleItem[]>([]);
  const [profiles, setProfiles] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [viewType, setViewType] = useState<'month' | 'grid' | 'list'>('month');
  const [loading, setLoading] = useState(true);
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7 AM to 9 PM
  const SLOT_HEIGHT = 100; // pixels per hour

  // Form State
  const [newItem, setNewItem] = useState<Partial<WorkScheduleItem>>({
    type: ScheduleItemType.MEETING,
    title: '',
    slotType: 'hourly',
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:00"),
    endTime: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:00"),
    userId: '',
  });

  const handleTimeSlotClick = (userId: string, hour: number) => {
    const clickedDate = setMinutes(setHours(selectedDate, hour), 0);
    setNewItem({
      ...newItem,
      userId: userId,
      startTime: format(clickedDate, "yyyy-MM-dd'T'HH:mm"),
      endTime: format(addHours(clickedDate, 1), "yyyy-MM-dd'T'HH:mm"),
    });
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!userProfile?.tenantId) return;

    const profilesQuery = query(
      collection(db, 'users'),
      where('tenantId', '==', userProfile.tenantId)
    );

    const unsubscribeProfiles = onSnapshot(profilesQuery, (snapshot) => {
      let profileData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      
      if (user && userProfile && !profileData.find(p => p.id === user.uid)) {
        profileData.push(userProfile);
      }

      // Sort profiles: Admins, then Designers, then Vendors, then Clients
      const roleOrder = { [Role.ADMIN]: 0, [Role.DESIGNER]: 1, [Role.VENDOR]: 2, [Role.CLIENT]: 3 };
      profileData.sort((a, b) => (roleOrder[a.role as Role] ?? 9) - (roleOrder[b.role as Role] ?? 9));

      setProfiles(profileData);
    });

    const scheduleQuery = viewType === 'month' 
      ? query(
          collection(db, 'work_schedules'),
          where('tenantId', '==', userProfile.tenantId),
          where('date', '>=', format(startOfMonth(selectedDate), 'yyyy-MM-dd')),
          where('date', '<=', format(endOfMonth(selectedDate), 'yyyy-MM-dd'))
        )
      : query(
          collection(db, 'work_schedules'),
          where('tenantId', '==', userProfile.tenantId),
          where('date', '==', format(selectedDate, 'yyyy-MM-dd'))
        );

    const unsubscribeSchedule = onSnapshot(scheduleQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkScheduleItem));
      
      // Add Dummy Planning Items for visualization
      const monthStart = startOfMonth(selectedDate);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      const dummyItems: WorkScheduleItem[] = [
        {
          id: 'dummy-1',
          tenantId: userProfile?.tenantId || '',
          userId: user?.uid || '',
          creatorId: 'system',
          type: ScheduleItemType.SITE_VISIT,
          title: 'Morning Site Audit',
          date: todayStr,
          status: 'completed',
          slotType: 'first_half',
          startTime: format(setHours(new Date(), 9), "yyyy-MM-dd'T'09:00"),
          endTime: format(setHours(new Date(), 12), "yyyy-MM-dd'T'12:00"),
          isConfirmed: true,
          comments: []
        },
        {
          id: 'dummy-2',
          tenantId: userProfile?.tenantId || '',
          userId: '', 
          creatorId: 'system',
          type: ScheduleItemType.MEETING,
          title: 'Team Sync (Unassigned)',
          date: todayStr,
          status: 'in-progress',
          slotType: 'hourly',
          startTime: format(setHours(new Date(), 14), "yyyy-MM-dd'T'14:00"),
          endTime: format(setHours(new Date(), 15), "yyyy-MM-dd'T'15:00"),
          isConfirmed: false,
          comments: []
        },
        {
          id: 'dummy-3',
          tenantId: userProfile?.tenantId || '',
          userId: profiles[0]?.id || user?.uid || '',
          creatorId: 'system',
          type: ScheduleItemType.TRAVEL,
          title: 'Route to Client Location',
          date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
          status: 'planned',
          slotType: 'hourly',
          startTime: format(setHours(addDays(new Date(), 1), 10), "yyyy-MM-dd'T'10:00"),
          endTime: format(setHours(addDays(new Date(), 1), 11), "yyyy-MM-dd'T'11:00"),
          isConfirmed: true,
          comments: []
        },
        {
          id: 'dummy-4',
          tenantId: userProfile?.tenantId || '',
          userId: '',
          creatorId: 'system',
          type: ScheduleItemType.FOCUS_WORK,
          title: 'Design Review',
          date: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
          status: 'planned',
          slotType: 'second_half',
          startTime: format(setHours(addDays(new Date(), 2), 14), "yyyy-MM-dd'T'14:00"),
          endTime: format(setHours(addDays(new Date(), 2), 18), "yyyy-MM-dd'T'18:00"),
          isConfirmed: false,
          comments: []
        },
        {
          id: 'dummy-5',
          tenantId: userProfile?.tenantId || '',
          userId: user?.uid || '',
          creatorId: 'system',
          type: ScheduleItemType.MEETING,
          title: 'Final Handover',
          date: format(addDays(new Date(), 4), 'yyyy-MM-dd'),
          status: 'planned',
          slotType: 'hourly',
          startTime: format(setHours(addDays(new Date(), 4), 11), "yyyy-MM-dd'T'11:00"),
          endTime: format(setHours(addDays(new Date(), 4), 12), "yyyy-MM-dd'T'12:00"),
          isConfirmed: true,
          comments: []
        }
      ];

      setScheduleItems([...items, ...dummyItems]);
      setLoading(false);
    });

    return () => {
      unsubscribeProfiles();
      unsubscribeSchedule();
    };
  }, [userProfile?.tenantId, selectedDate, user, userProfile, viewType]);

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile?.tenantId || !user) return;

    try {
      await addDoc(collection(db, 'work_schedules'), {
        ...newItem,
        tenantId: userProfile.tenantId,
        creatorId: user.uid,
        date: format(selectedDate, 'yyyy-MM-dd'),
        status: 'planned' as ScheduleItemStatus,
        isConfirmed: false,
        comments: [],
        createdAt: Timestamp.now()
      });
      setIsModalOpen(false);
      setNewItem({
        type: ScheduleItemType.MEETING,
        title: '',
        slotType: 'hourly',
        startTime: format(new Date(), "yyyy-MM-dd'T'HH:00"),
        endTime: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:00"),
        userId: '',
      });
    } catch (error) {
      console.error("Error adding schedule:", error);
    }
  };

  const checkConflict = (item: WorkScheduleItem) => {
    return scheduleItems.some(other => 
      other.id !== item.id && 
      other.userId === item.userId && 
      other.userId !== '' && // Don't check unassigned for conflicts
      other.date === item.date &&
      ((parseISO(item.startTime) >= parseISO(other.startTime) && parseISO(item.startTime) < parseISO(other.endTime)) ||
       (parseISO(item.endTime) > parseISO(other.startTime) && parseISO(item.endTime) <= parseISO(other.endTime)))
    );
  };

  const updateItemStatus = async (itemId: string, status: ScheduleItemStatus) => {
    try {
      await updateDoc(doc(db, 'work_schedules', itemId), { status });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const getTimePosition = (timeStr: string) => {
    const date = parseISO(timeStr);
    const hour = date.getHours();
    const minutes = date.getMinutes();
    const offsetFromStart = (hour - HOURS[0]) * SLOT_HEIGHT + (minutes / 60) * SLOT_HEIGHT;
    return offsetFromStart;
  };

  const getTimeDurationHeight = (startStr: string, endStr: string) => {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const diff = differenceInMinutes(end, start);
    return (diff / 60) * SLOT_HEIGHT;
  };

  const getTypeColor = (type: ScheduleItemType) => {
    switch (type) {
      case ScheduleItemType.MEETING: return 'bg-blue-50 border-blue-200 text-blue-700';
      case ScheduleItemType.SITE_VISIT: return 'bg-purple-50 border-purple-200 text-purple-700';
      case ScheduleItemType.FOCUS_WORK: return 'bg-green-50 border-green-200 text-green-700';
      case ScheduleItemType.LEAVE: return 'bg-red-50 border-red-200 text-red-700';
      case ScheduleItemType.TRAVEL: return 'bg-amber-50 border-amber-200 text-amber-700';
      default: return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  };

  return (
    <div className="p-3 md:p-4 bg-gray-50 min-h-screen">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-100">
               <CalendarDays className="text-gray-900 w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">Team Pulse</h1>
              <div className="flex items-center gap-2">
                 <p className="text-[10px] text-gray-400 font-bold">Global Coordination</p>
                 {profiles.filter(p => p.role === Role.DESIGNER).length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-full border border-blue-100">
                       <div className="w-1 h-1 rounded-full bg-blue-500" />
                       <span className="text-[8px] font-bold text-blue-700">
                         {profiles.filter(p => p.role === Role.DESIGNER).length} Designers
                       </span>
                    </div>
                 )}
                 {viewType !== 'month' && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 rounded-full border border-green-100">
                       <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                       <span className="text-[8px] font-bold text-green-700">
                          {scheduleItems.filter(i => i.status === 'completed').length}/{scheduleItems.length} Done
                       </span>
                    </div>
                 )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher */}
            <div className="bg-white rounded-lg border p-1 flex items-center shadow-sm text-[10px] font-bold text-gray-400">
              <button 
                title="My Pulse"
                onClick={() => setShowOnlyMine(!showOnlyMine)}
                className={`flex gap-1.5 items-center px-3 py-1.5 rounded-md transition ${showOnlyMine ? 'bg-indigo-600 text-white shadow-sm' : 'hover:bg-gray-50'}`}
              >
                <Users size={12} /> {showOnlyMine ? 'My Work' : 'All Team'}
              </button>
              <div className="w-px h-4 bg-gray-100 mx-1" />
              <button 
                title="Month View"
                aria-label="Switch to Month View"
                onClick={() => setViewType('month')}
                className={`flex gap-1.5 items-center px-3 py-1.5 rounded-md transition ${viewType === 'month' ? 'bg-gray-900 text-white shadow-sm' : 'hover:bg-gray-50'}`}
              >
                <Calendar size={12} /> Month
              </button>
              <button 
                title="Daily Grid"
                aria-label="Switch to Daily Grid"
                onClick={() => setViewType('grid')}
                className={`flex gap-1.5 items-center px-3 py-1.5 rounded-md transition ${viewType === 'grid' ? 'bg-gray-900 text-white shadow-sm' : 'hover:bg-gray-50'}`}
              >
                <LayoutGrid size={12} /> Daily
              </button>
              <button 
                title="List View"
                aria-label="Switch to List View"
                onClick={() => setViewType('list')}
                className={`flex gap-1.5 items-center px-3 py-1.5 rounded-md transition ${viewType === 'list' ? 'bg-gray-900 text-white shadow-sm' : 'hover:bg-gray-50'}`}
              >
                <List size={12} /> List
              </button>
            </div>

            <button 
              title="Jump to Today"
              onClick={() => {
                const now = new Date();
                setSelectedDate(now);
                setViewDate(now);
              }}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 hover:bg-gray-50 transition shadow-sm"
            >
              Today
            </button>

            <div className="relative flex items-center bg-white rounded-lg shadow-sm border p-1">
              <button 
                title={viewType === 'month' ? "Previous Month" : "Previous Day"}
                aria-label={viewType === 'month' ? "Previous Month" : "Previous Day"}
                onClick={() => {
                  const newDate = viewType === 'month' ? subMonths(selectedDate, 1) : subDays(selectedDate, 1);
                  setSelectedDate(newDate);
                  setViewDate(newDate);
                }}
                className="p-1.5 hover:bg-gray-50 rounded"
              >
                <ChevronLeft size={16} />
              </button>
              
              <button 
                title="Open Calendar Picker"
                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                className="px-2 py-1 hover:bg-gray-50 rounded flex items-center gap-1.5 transition"
              >
                <span className="font-bold text-gray-900 text-[11px] whitespace-nowrap tracking-tight">
                  {viewType === 'month' ? format(selectedDate, 'MMMM yyyy') : format(selectedDate, 'MMM do')}
                </span>
                <Calendar size={12} className="text-gray-300" />
              </button>

              <button 
                title={viewType === 'month' ? "Next Month" : "Next Day"}
                aria-label={viewType === 'month' ? "Next Month" : "Next Day"}
                onClick={() => {
                  const newDate = viewType === 'month' ? addMonths(selectedDate, 1) : addDays(selectedDate, 1);
                  setSelectedDate(newDate);
                  setViewDate(newDate);
                }}
                className="p-1.5 hover:bg-gray-50 rounded"
              >
                <ChevronRight size={16} />
              </button>

              {isCalendarOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-[100] w-[320px]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900">{format(viewDate, 'MMMM yyyy')}</h3>
                    <div className="flex items-center gap-1">
                      <button title="Previous Month" aria-label="Previous Month" onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronLeft size={16} /></button>
                      <button title="Next Month" aria-label="Next Month" onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (<div key={day} className="text-[10px] font-bold text-gray-400 text-center py-1">{day}</div>))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {(() => {
                      const start = startOfWeek(startOfMonth(viewDate));
                      const end = endOfWeek(endOfMonth(viewDate));
                      const days = eachDayOfInterval({ start, end });
                      return days.map(day => {
                        const isCurrentMonth = isSameDay(startOfMonth(day), startOfMonth(viewDate));
                        const isSelected = isSameDay(day, selectedDate);
                        return (
                          <button
                            key={day.toISOString()}
                            title={`Select ${format(day, 'MMM do')}`}
                            aria-label={`Select ${format(day, 'MMM do')}`}
                            onClick={() => { setSelectedDate(day); setViewDate(day); setIsCalendarOpen(false); }}
                            className={`h-9 w-9 flex items-center justify-center rounded-lg text-sm transition-all font-bold ${!isCurrentMonth ? 'text-gray-200' : isSelected ? 'bg-gray-900 text-white shadow-xl scale-110' : 'hover:bg-gray-100'}`}
                          >
                            {format(day, 'd')}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>

            <button 
              title="Add New Schedule"
              onClick={() => { setNewItem({ ...newItem, userId: '' }); setIsModalOpen(true); }}
              className="bg-gray-900 text-white px-4 py-1.5 rounded-lg flex items-center gap-2 hover:bg-black transition shadow-lg active:scale-95 font-bold text-[10px]"
            >
              <Plus size={14} /> Add
            </button>
            
            {/* Admin Quick Meeting */}
            {user?.role === Role.ADMIN && (
              <button 
                onClick={() => {
                  setNewItem({
                    ...newItem,
                    type: ScheduleItemType.MEETING,
                    title: 'Meeting Work: ',
                    userId: user.id,
                    startTime: format(new Date(), "yyyy-MM-dd'T'HH:00"),
                    endTime: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:00"),
                  });
                  setIsModalOpen(true);
                }}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition shadow-sm active:scale-95 flex items-center gap-1.5"
              >
                <Calendar size={12} /> Meeting
              </button>
            )}
          </div>
        </div>

        {/* Main View Area */}
        {viewType === 'month' ? (
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-white">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-3 text-center border-r border-gray-50 last:border-r-0">
                  <span className="text-[9px] font-bold text-gray-300">{day}</span>
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 auto-rows-fr h-[calc(100vh-280px)] min-h-[600px]">
              {(() => {
                const monthStart = startOfMonth(selectedDate);
                const monthEnd = endOfMonth(monthStart);
                const startDate = startOfWeek(monthStart);
                const endDate = endOfWeek(monthEnd);
                const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

                return calendarDays.map((day, idx) => {
                  const dayItems = scheduleItems.filter(item => item.date === format(day, 'yyyy-MM-dd'));
                  const isCurrentMonth = isSameDay(startOfMonth(day), startOfMonth(selectedDate));
                  const isTodayActive = isToday(day);

                  return (
                    <div 
                      key={day.toISOString()}
                      onClick={() => {
                        setSelectedDate(day);
                        setNewItem({
                          ...newItem,
                          userId: '',
                          startTime: format(setHours(day, 9), "yyyy-MM-dd'T'09:00"),
                          endTime: format(setHours(day, 10), "yyyy-MM-dd'T'10:00"),
                        });
                        setIsModalOpen(true);
                      }}
                      className={`min-h-[100px] p-2 border-r border-b border-gray-50 transition-all hover:bg-gray-50/50 cursor-pointer group relative flex flex-col
                        ${!isCurrentMonth ? 'bg-gray-50/20' : 'bg-white'}
                        ${(idx + 1) % 7 === 0 ? 'border-r-0' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-lg transition-all
                          ${isTodayActive ? 'bg-gray-900 text-white shadow-md scale-110' : isCurrentMonth ? 'text-gray-900' : 'text-gray-200'}`}>
                          {format(day, 'd')}
                        </span>
                        {dayItems.length > 0 && (
                          <div className="flex -space-x-1.5 opacity-80">
                            {Array.from(new Set(dayItems.map(i => i.userId))).slice(0, 3).map((uid, uIdx) => {
                              const p = profiles.find(pr => pr.id === uid);
                              if (!uid) {
                                return (
                                  <div key="unassigned" title="Public Activity" className="w-5 h-5 rounded-full border border-white bg-gray-900 text-white flex items-center justify-center text-[7px] font-bold shadow-sm overflow-hidden">
                                    *
                                  </div>
                                );
                              }
                              return (
                                <button 
                                  key={uIdx} 
                                  title={p?.name} 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNewItem({ 
                                      ...newItem, 
                                      userId: uid,
                                      date: format(day, 'yyyy-MM-dd'),
                                      startTime: format(setHours(day, 10), "yyyy-MM-dd'T'10:00"),
                                      endTime: format(setHours(day, 11), "yyyy-MM-dd'T'11:00")
                                    });
                                    setIsModalOpen(true);
                                  }}
                                  className="w-5 h-5 rounded-full border border-white bg-gray-100 flex items-center justify-center text-[7px] font-bold shadow-sm overflow-hidden hover:scale-110 hover:z-10 transition-transform cursor-pointer"
                                >
                                  {p?.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : p?.name ? p.name[0] : '?'}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="space-y-0.5 flex-1 overflow-hidden mt-1">
                        {dayItems.slice(0, 3).map(item => {
                          const isConflict = checkConflict(item);
                          const isComplete = item.status === 'completed';
                          return (
                            <div key={item.id} className="relative group/task">
                              <div 
                                className={`px-1.5 py-0.5 rounded-md border text-[8px] font-bold truncate transition-all cursor-pointer hover:shadow-sm
                                  ${getTypeColor(item.type)} 
                                  ${isConflict ? 'border-red-500 bg-red-50 text-red-900 border-2' : ''}
                                  ${isComplete ? 'opacity-50 line-through' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextStatus = item.status === 'planned' ? 'in-progress' : item.status === 'in-progress' ? 'completed' : 'planned';
                                  updateItemStatus(item.id, nextStatus as any);
                                }}
                              >
                                {isConflict && '⚠️ '}{isComplete && '✓ '}{item.title}
                              </div>
                              <div className="invisible group-hover/task:visible absolute top-full left-0 mt-1 z-50 bg-gray-900 text-white text-[7px] p-2 rounded shadow-xl min-w-[120px]">
                                 <p className="font-bold border-b border-white/10 pb-1 mb-1">{item.title}</p>
                                 <p className="opacity-70">Assigned: {profiles.find(p => p.id === item.userId)?.name || 'Unassigned'}</p>
                                 <p className="opacity-70">Status: {item.status}</p>
                              </div>
                            </div>
                          );
                        })}
                        {dayItems.length > 3 && (
                          <div className="text-[7px] font-bold text-gray-400 px-1">+{dayItems.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : viewType === 'grid' ? (
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden relative">
            <div className="flex border-b border-gray-100 sticky top-0 bg-white z-40 overflow-x-auto scrollbar-hide">
              <div className="w-16 md:w-20 border-r border-gray-100 bg-gray-50/50 shrink-0 flex items-center justify-center">
                 <Clock size={14} className="text-gray-300" />
              </div>
              <div className="flex flex-1 min-w-max">
                {/* Public / Unassigned Column Header */}
                {!showOnlyMine && (
                  <div className="w-[180px] md:w-[220px] border-r border-gray-100 flex items-center gap-3 p-3 shrink-0 bg-gray-50/50">
                    <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center font-bold text-[10px] text-white border border-white shadow-inner">
                      <Users size={14} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-[10px] md:text-xs truncate tracking-tight">Public / Team</h3>
                      <p className="text-[8px] text-indigo-500 font-bold">Unassigned</p>
                    </div>
                  </div>
                )}

                {profiles.filter(p => !showOnlyMine || p.id === user?.uid).map(profile => (
                  <div key={profile.id} className="w-[180px] md:w-[220px] border-r border-gray-100 flex items-center gap-3 p-3 shrink-0 hover:bg-gray-50 transition-colors">
                    <div className="relative">
                      {profile.avatar ? <img src={profile.avatar} alt={profile.name} className="w-8 h-8 rounded-full border border-white shadow-sm" /> : 
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-[10px] text-gray-400 border border-white shadow-inner">{profile.name[0]}</div>}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white 
                        ${profile.role === Role.ADMIN ? 'bg-amber-400' : profile.role === Role.DESIGNER ? 'bg-indigo-500' : profile.role === Role.CLIENT ? 'bg-teal-500' : 'bg-gray-400'}`} />
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2">
                         <h3 className="font-bold text-gray-900 text-[10px] md:text-xs truncate tracking-tight">{profile.name}</h3>
                         {profile.role === Role.ADMIN && <span className="text-[7px] bg-amber-100 text-amber-700 px-1 rounded font-bold">You</span>}
                      </div>
                      <div className="flex items-center gap-2">
                         <p className="text-[8px] text-gray-400 font-bold">{profile.role}</p>
                         {(() => {
                            const taskCount = scheduleItems.filter(i => i.userId === profile.id && i.date === format(selectedDate, 'yyyy-MM-dd')).length;
                            return taskCount === 0 ? (
                              <span className="text-[7px] font-bold text-green-600 bg-green-50 px-1 rounded">Available</span>
                            ) : (
                              <span className="text-[7px] font-bold text-indigo-500">
                                 {taskCount} tasks
                              </span>
                            );
                         })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex h-[calc(100vh-280px)] overflow-y-auto relative scrollbar-show scroll-smooth bg-gray-50/10" ref={gridRef}>
              {/* Time Column */}
              <div className="w-16 md:w-20 border-r border-gray-100 bg-white shrink-0 select-none">
                {HOURS.map(hour => (
                  <div key={hour} style={{ height: SLOT_HEIGHT }} className="relative border-b border-gray-50 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-gray-300">
                      {format(setHours(new Date(), hour), 'h a')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grid Background & Interactive Layers */}
              <div className="flex-1 flex min-w-max relative overflow-visible">
                {/* Public / Unassigned Column */}
                {!showOnlyMine && (
                  <div key="public-grid" className="w-[180px] md:w-[220px] border-r border-gray-100 relative group bg-gray-50/10 overflow-visible">
                    {HOURS.map(hour => (
                      <div 
                        key={hour} 
                        style={{ height: SLOT_HEIGHT }} 
                        className="hover:bg-gray-100/50 transition-all cursor-pointer border-b border-gray-100/30 relative overflow-hidden group/slot"
                        onClick={() => handleTimeSlotClick('', hour)}
                        title={`Schedule unassigned task at ${hour}:00`}
                      >
                         <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity">
                            <Plus size={14} className="text-gray-300" />
                         </div>
                      </div>
                    ))}

                    {scheduleItems.filter(item => 
                      !item.userId && 
                      item.date === format(selectedDate, 'yyyy-MM-dd')
                    ).map(item => {
                      const top = getTimePosition(item.startTime);
                      const height = getTimeDurationHeight(item.startTime, item.endTime);
                      const isComplete = item.status === 'completed';

                      return (
                        <div 
                          key={item.id}
                          style={{ top: `${top}px`, height: `${Math.max(height, 50)}px`, width: 'calc(100% - 16px)', left: '8px' }}
                          className={`absolute z-10 rounded-xl p-2 md:p-3 border shadow-sm transition-all hover:shadow-md cursor-pointer group/item bg-gray-900 border-gray-800 text-white ${isComplete ? 'opacity-40' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextStatus = item.status === 'planned' ? 'in-progress' : item.status === 'in-progress' ? 'completed' : 'planned';
                            updateItemStatus(item.id, nextStatus as any);
                          }}
                        >
                          <h4 className="font-bold text-[9px] md:text-[10px] text-white leading-tight mb-1 line-clamp-1 tracking-tighter">
                            {isComplete && '✓ '} {item.title}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[8px] font-bold opacity-60">
                             <Clock size={10} />
                             <span>{format(parseISO(item.startTime), 'HH:mm')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {profiles.filter(p => !showOnlyMine || p.id === user?.uid).map(profile => {
                  const userItems = scheduleItems.filter(item => 
                    item.userId === profile.id && 
                    item.date === format(selectedDate, 'yyyy-MM-dd')
                  );
                  return (
                    <div key={profile.id} className="w-[180px] md:w-[220px] border-r border-gray-100 relative group bg-white/5 overflow-visible">
                      {/* Interaction Hooks */}
                      {HOURS.map(hour => (
                        <div 
                          key={hour} 
                          style={{ height: SLOT_HEIGHT }} 
                          className="hover:bg-gray-50/50 transition-all cursor-pointer border-b border-gray-50/50 relative overflow-hidden group/slot"
                          onClick={() => handleTimeSlotClick(profile.id, hour)}
                          title={`Schedule ${profile.name} at ${hour}:00`}
                          aria-label={`Schedule ${profile.name} at ${hour}:00`}
                        >
                           <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity">
                              <Plus size={14} className="text-gray-200" />
                           </div>
                        </div>
                      ))}

                      {/* Actual Events */}
                      {userItems.map(item => {
                        const top = getTimePosition(item.startTime);
                        const height = getTimeDurationHeight(item.startTime, item.endTime);
                        const isConflict = checkConflict(item);
                        const isComplete = item.status === 'completed';

                        return (
                          <div 
                            key={item.id}
                            style={{ top: `${top}px`, height: `${Math.max(height, 50)}px`, width: 'calc(100% - 16px)', left: '8px' }}
                            className={`absolute z-10 rounded-xl p-2 md:p-3 border shadow-sm transition-all hover:shadow-md cursor-pointer group/item
                              ${getTypeColor(item.type)}
                              ${isConflict ? 'ring-2 ring-red-500 ring-offset-2 animate-pulse' : ''}
                              ${isComplete ? 'opacity-60 grayscale-[0.5]' : ''}`}
                            onClick={(e) => {
                               e.stopPropagation();
                               const nextStatus = item.status === 'planned' ? 'in-progress' : item.status === 'in-progress' ? 'completed' : 'planned';
                               updateItemStatus(item.id, nextStatus as any);
                            }}
                          >
                            <div className="flex justify-between items-start mb-1 overflow-hidden">
                               <h4 className="font-bold text-[9px] md:text-[10px] text-gray-900 leading-tight line-clamp-1 tracking-tighter">
                                  {isComplete && '✓ '} {item.title}
                               </h4>
                               {isConflict && <AlertCircle size={10} className="text-red-600 animate-bounce shrink-0" />}
                            </div>
                            <div className="flex items-center gap-1.5 text-[8px] font-bold opacity-60">
                               <Clock size={10} />
                               <span>{format(parseISO(item.startTime), 'HH:mm')}</span>
                            </div>

                            {/* Status Indicator Bar */}
                            <div className="absolute top-1 right-1 flex items-center gap-0.5">
                               <div className={`w-1 h-1 rounded-full ${item.status === 'completed' ? 'bg-green-500' : item.status === 'in-progress' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                            </div>

                            {/* Tooltip Expansion */}
                            <div className="invisible group-hover/item:visible absolute left-full ml-4 top-0 w-60 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-[200] animate-in fade-in slide-in-from-left-2 duration-200">
                               <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50">
                                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-[10px] font-bold border border-white">{profile.name[0]}</div>
                                  <div className="overflow-hidden">
                                     <p className="text-[8px] font-bold text-gray-300 leading-none mb-0.5">{profile.role}</p>
                                     <p className="font-bold text-gray-900 text-[10px] truncate">{profile.name}</p>
                                  </div>
                               </div>
                               <h5 className="font-bold text-gray-900 text-xs mb-2 leading-tight tracking-tight">{item.title}</h5>
                               {item.description && <p className="text-[10px] text-gray-500 mb-3 bg-gray-50 p-2 rounded-lg leading-relaxed italic border border-gray-100">"{item.description}"</p>}
                               <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border ${item.isConfirmed ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
                                     {item.isConfirmed ? 'Confirmed' : 'Waiting'}
                                  </span>
                               </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Simplified List View for Team Overview */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-300">
             {/* Public / Unassigned Card */}
             <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 shadow-lg hover:shadow-xl transition-all group overflow-hidden">
                <div className="flex items-center gap-3 mb-4">
                   <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/20 shadow-inner">
                      <Users size={16} />
                   </div>
                   <div className="overflow-hidden">
                      <h3 className="font-bold text-xs text-white truncate tracking-tight">Public Tasks</h3>
                      <span className="text-[9px] font-bold text-indigo-400 leading-none">Unassigned</span>
                   </div>
                </div>
                <div className="space-y-3">
                   {/* ... */}
                   {(() => {
                      const unassigned = scheduleItems.filter(item => 
                        !item.userId && 
                        item.date === format(selectedDate, 'yyyy-MM-dd')
                      );
                      return unassigned.length === 0 ? (
                         <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-2xl opacity-40">
                            <p className="text-[9px] font-bold text-gray-500 italic">No public tasks</p>
                         </div>
                      ) : (
                         unassigned.sort((a,b)=>a.startTime.localeCompare(b.startTime)).map(item => (
                            <div key={item.id} className={`p-3 rounded-xl border bg-white/5 border-white/10 transition-transform hover:scale-[1.02]`}>
                               <div className="flex justify-between items-center mb-1">
                                  <p className="text-[8px] font-bold text-indigo-400">{item.type}</p>
                                  <p className="text-[8px] font-bold text-white/40">{format(parseISO(item.startTime), 'h:mm a')}</p>
                               </div>
                               <p className="text-[11px] font-bold text-white truncate leading-none">{item.title}</p>
                            </div>
                         ))
                      );
                   })()}
                </div>
             </div>

             {profiles.map(profile => {
                const userItems = scheduleItems.filter(item => 
                  item.userId === profile.id && 
                  item.date === format(selectedDate, 'yyyy-MM-dd')
                );
                return (
                   <div key={profile.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-lg hover:shadow-xl transition-all group">
                      <div className="flex items-center gap-3 mb-4">
                         <div className="relative">
                            {profile.avatar ? <img src={profile.avatar} alt={profile.name} className="w-10 h-10 rounded-full border shadow-sm" /> : 
                              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-300 border border-white shadow-inner">{profile.name[0]}</div>}
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${profile.role === Role.ADMIN ? 'bg-amber-400' : profile.role === Role.DESIGNER ? 'bg-indigo-500' : profile.role === Role.CLIENT ? 'bg-teal-500' : 'bg-gray-400'}`} />
                         </div>
                         <div className="overflow-hidden">
                            <h3 className="font-bold text-xs text-gray-900 truncate tracking-tight">{profile.name}</h3>
                            <span className="text-[9px] font-bold text-gray-300 leading-none">{profile.role}</span>
                         </div>
                      </div>
                      <div className="space-y-3">
                         {userItems.length === 0 ? (
                            <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-gray-50 rounded-2xl opacity-40">
                               <p className="text-[9px] font-bold text-gray-300 italic">Free Schedule</p>
                            </div>
                         ) : (
                            userItems.sort((a,b)=>a.startTime.localeCompare(b.startTime)).map(item => (
                               <div key={item.id} className={`p-3 rounded-xl border-2 transition-transform hover:scale-[1.02] ${getTypeColor(item.type)}`}>
                                  <div className="flex justify-between items-center mb-1">
                                     <p className="text-[8px] font-bold opacity-50">{item.type}</p>
                                     <p className="text-[8px] font-bold opacity-40">{format(parseISO(item.startTime), 'h:mm a')}</p>
                                  </div>
                                  <p className="text-[11px] font-bold text-gray-900 truncate leading-none">{item.title}</p>
                               </div>
                            ))
                         )}
                      </div>
                   </div>
                );
             })}
          </div>
        )}

        {/* Sync Status Footer */}
        <div className="mt-6 flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-900 rounded-2xl p-4 border border-white/5 shadow-2xl relative overflow-hidden group">
           <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 opacity-50" />
           <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-md shadow-2xl border border-white/20">
                 <CheckCircle2 size={24} className="text-green-400" />
              </div>
              <div>
                 <h4 className="font-bold text-white text-base tracking-tight">Enterprise Coordination Deck</h4>
                 <p className="text-[9px] text-gray-400 font-bold">Global Synchronization Active</p>
              </div>
           </div>
           <div className="relative flex flex-wrap justify-center gap-2">
              {['Admin', 'Designer', 'Client', 'Vendor'].map(role => (
                 <div key={role} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm shadow-xl">
                    <div className={`w-2 h-2 rounded-full ring-2 ring-white/5 ${role === 'Admin' ? 'bg-amber-400' : role === 'Designer' ? 'bg-indigo-500' : role === 'Client' ? 'bg-teal-500' : 'bg-gray-400'}`} />
                    <span className="text-[9px] font-bold text-white">{role}</span>
                 </div>
              ))}
           </div>
        </div>

        {/* Unified Add Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-md z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10 transition-all">
                <div>
                   <h2 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight leading-none">Schedule Activity</h2>
                   <p className="text-[9px] text-gray-400 font-bold mt-1">
                     {profiles.find(p => p.id === newItem.userId)?.name || 'Team member'}
                   </p>
                </div>
                {checkConflict(newItem as WorkScheduleItem) && (
                   <div className="mx-4 px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 animate-pulse">
                      <AlertCircle size={14} className="text-red-500" />
                      <span className="text-[9px] font-bold text-red-700">Overlap Detected</span>
                   </div>
                )}
                <button 
                  title="Close Modal" 
                  aria-label="Close Modal" 
                  onClick={() => setIsModalOpen(false)} 
                  className="w-8 h-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 transition-colors"
                >
                   <XCircle size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 md:p-6">
                <form id="schedule-form" onSubmit={handleAddSchedule} className="space-y-5">
                  <div className="space-y-1">
                    <label htmlFor="user-select" className="text-[9px] font-bold text-gray-400 ml-1">Team Member (Optional)</label>
                    <select 
                      id="user-select"
                      title="Select Team Member"
                      value={newItem.userId || ''}
                      onChange={e => setNewItem({...newItem, userId: e.target.value})}
                      className="w-full rounded-xl border-gray-100 bg-gray-50 py-2.5 px-4 font-bold text-xs text-gray-900 focus:ring-4 focus:ring-gray-900/5 transition-all outline-none"
                    >
                      <option value="">Public / Unassigned Activity</option>
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="title-input" className="text-[9px] font-bold text-gray-400 ml-1">Work Title</label>
                    <input 
                      id="title-input"
                      title="Work Title"
                      required type="text" value={newItem.title}
                      onChange={e => setNewItem({...newItem, title: e.target.value})}
                      placeholder="e.g. Client Site Visit"
                      className="w-full rounded-xl border-gray-100 bg-gray-50 py-2.5 px-4 font-bold text-xs text-gray-900 focus:ring-4 focus:ring-gray-900/5 transition-all outline-none placeholder:text-gray-300"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1">
                        <label htmlFor="type-select" className="text-[9px] font-bold text-gray-400 ml-1">Category</label>
                        <select 
                          id="type-select"
                          title="Activity Category"
                          value={newItem.type} 
                          onChange={e => setNewItem({...newItem, type: e.target.value as any})} 
                          className="w-full rounded-xl border-gray-100 bg-gray-50 py-2.5 px-3 font-bold text-[10px] outline-none focus:ring-4 focus:ring-gray-900/5"
                        >
                           {Object.values(ScheduleItemType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                     </div>
                     <div className="space-y-1">
                        <label htmlFor="slot-select" className="text-[9px] font-bold text-gray-400 ml-1">Timing Slot</label>
                        <div className="flex gap-1">
                          {[
                            { id: 'hourly', label: 'Precise' },
                            { id: 'first_half', label: 'AM' },
                            { id: 'second_half', label: 'PM' }
                          ].map(slot => (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => {
                                const baseDate = parseISO(newItem.startTime || new Date().toISOString());
                                let start = newItem.startTime;
                                let end = newItem.endTime;
                                
                                if (slot.id === 'first_half') {
                                  start = format(setHours(baseDate, 9), "yyyy-MM-dd'T'09:00");
                                  end = format(setHours(baseDate, 13), "yyyy-MM-dd'T'13:00");
                                } else if (slot.id === 'second_half') {
                                  start = format(setHours(baseDate, 14), "yyyy-MM-dd'T'14:00");
                                  end = format(setHours(baseDate, 18), "yyyy-MM-dd'T'18:00");
                                }
                                
                                setNewItem({
                                  ...newItem, 
                                  slotType: slot.id as any,
                                  startTime: start,
                                  endTime: end
                                });
                              }}
                              className={`flex-1 py-1.5 rounded-lg border font-bold text-[8px] transition-all
                                ${newItem.slotType === slot.id ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100'}`}
                            >
                              {slot.label}
                            </button>
                          ))}
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="start-time" className="text-[9px] font-bold text-gray-400 ml-1">Start</label>
                      <input 
                        id="start-time"
                        title="Start Time"
                        type="datetime-local" 
                        value={newItem.startTime} 
                        onChange={e => setNewItem({...newItem, startTime: e.target.value})} 
                        className="w-full rounded-xl border-gray-100 bg-gray-50 py-2.5 px-3 text-[10px] font-bold outline-none" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="end-time" className="text-[9px] font-bold text-gray-400 ml-1">End</label>
                      <input 
                        id="end-time"
                        title="End Time"
                        type="datetime-local" 
                        value={newItem.endTime} 
                        onChange={e => setNewItem({...newItem, endTime: e.target.value})} 
                        className="w-full rounded-xl border-gray-100 bg-gray-50 py-2.5 px-3 text-[10px] font-bold outline-none" 
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="description-area" className="text-[9px] font-bold text-gray-400 ml-1">Notes</label>
                    <textarea 
                      id="description-area"
                      title="Notes and Details"
                      value={newItem.description} 
                      onChange={e => setNewItem({...newItem, description: e.target.value})} 
                      rows={2} 
                      placeholder="Add specific instructions..." 
                      className="w-full rounded-xl border-gray-100 bg-gray-50 font-bold p-3 text-xs outline-none focus:ring-4 focus:ring-gray-900/5 transition-all placeholder:text-gray-300" 
                    />
                  </div>
                </form>
              </div>

              <div className="p-3 bg-white border-t flex gap-3 mt-auto">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex-1 py-2.5 text-gray-400 font-bold text-[9px] hover:text-gray-900 transition"
                >
                  Discard
                </button>
                <button 
                  type="submit" 
                  form="schedule-form"
                  className="flex-1 py-2.5 bg-gray-900 text-white font-bold rounded-xl shadow-md hover:bg-black transition active:scale-95 text-[9px]"
                >
                  Create Entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamScheduler;