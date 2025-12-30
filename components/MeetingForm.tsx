import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Meeting, User } from '../types';
import { X, Plus, Users, Edit3 } from 'lucide-react';
import { AvatarCircle } from '../utils/avatarUtils';
import { formatDateToIndian, formatIndianToISO } from '../utils/taskUtils';

interface MeetingFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (meeting: Omit<Meeting, 'id'>) => Promise<void>;
  onUpdate?: (meeting: Meeting) => Promise<void>;
  teamMembers: User[];
  isLoading?: boolean;
  editingMeeting?: Meeting | null;
}

const MeetingForm: React.FC<MeetingFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onUpdate,
  teamMembers,
  isLoading = false,
  editingMeeting = null,
}) => {
  const [newMeeting, setNewMeeting] = useState<Omit<Meeting, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    title: '',
    type: '',
    attendees: [],
    notes: '',
  });
  const [showErrors, setShowErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load existing meeting data when editing
  useEffect(() => {
    if (editingMeeting) {
      setNewMeeting({
        date: editingMeeting.date,
        title: editingMeeting.title,
        type: editingMeeting.type,
        attendees: editingMeeting.attendees,
        notes: editingMeeting.notes,
      });
    } else {
      // Reset form when creating new meeting
      setNewMeeting({
        date: new Date().toISOString().split('T')[0],
        title: '',
        type: '',
        attendees: [],
        notes: '',
      });
    }
    setShowErrors(false);
  }, [editingMeeting, isOpen]);

  const validateForm = () => {
    if (!newMeeting.date || !newMeeting.title || !newMeeting.type) {
      setShowErrors(true);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setIsSaving(true);
      
      if (editingMeeting && onUpdate) {
        // Update existing meeting
        await onUpdate({ ...editingMeeting, ...newMeeting });
      } else {
        // Create new meeting
        await onSubmit(newMeeting);
      }
      
      // Reset form only if creating new meeting
      if (!editingMeeting) {
        setNewMeeting({
          date: new Date().toISOString().split('T')[0],
          title: '',
          type: '',
          attendees: [],
          notes: '',
        });
      }
      setShowErrors(false);
      onClose();
    } catch (error) {
      console.error('Error saving meeting:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAttendee = (userId: string) => {
    setNewMeeting(prev => ({
      ...prev,
      attendees: prev.attendees.includes(userId)
        ? prev.attendees.filter(id => id !== userId)
        : [...prev.attendees, userId],
    }));
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[90]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[100] p-2 md:p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center flex-shrink-0">
            <h2 className="text-2xl md:text-xl font-bold text-gray-800">
              {editingMeeting ? 'Edit Meeting' : 'Add Meeting'}
            </h2>
            <button
              onClick={onClose}
              title="Close modal"
              className="p-1 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 md:w-4 md:h-4 text-gray-500" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-3 md:p-4 space-y-4">
            {/* Date */}
            <div>
              <label htmlFor="meeting-date" className="block text-base md:text-sm font-semibold text-gray-700 mb-1">
                Meeting Date <span className="text-red-500">*</span>
              </label>
              <input
                id="meeting-date"
                type="date"
                title="Select meeting date"
                value={newMeeting.date || ''}
                onChange={(e) => setNewMeeting(prev => ({ ...prev, date: e.target.value }))}
                className={`w-full px-3 md:px-2 py-2 md:py-1.5 text-base md:text-sm border rounded-md focus:outline-none focus:ring-1 focus:border-gray-800
                  ${showErrors && !newMeeting.date ? 'border-red-500' : 'border-gray-200'}`}
              />
              {showErrors && !newMeeting.date && (
                <p className="text-red-500 text-base md:text-sm mt-0.5">Meeting date is required</p>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-base md:text-sm font-semibold text-gray-700 mb-1">
                Meeting Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Client Kickoff, Site Visit Review"
                value={newMeeting.title}
                onChange={(e) => setNewMeeting(prev => ({ ...prev, title: e.target.value }))}
                className={`w-full px-3 md:px-2 py-2 md:py-1.5 text-base md:text-sm border rounded-md focus:outline-none focus:ring-1 focus:border-gray-800
                  ${showErrors && !newMeeting.title ? 'border-red-500' : 'border-gray-200'}`}
              />
              {showErrors && !newMeeting.title && (
                <p className="text-red-500 text-base md:text-sm mt-0.5">Meeting title is required</p>
              )}
            </div>

            {/* Meeting Type (Text Input) */}
            <div>
              <label className="block text-base md:text-sm font-semibold text-gray-700 mb-1">
                Meeting Type <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Discovery, Progress Review, Site Visit, Vendor Meet, Design Presentation"
                value={newMeeting.type}
                onChange={(e) => setNewMeeting(prev => ({ ...prev, type: e.target.value }))}
                className={`w-full px-3 md:px-2 py-2 md:py-1.5 text-base md:text-sm border rounded-md focus:outline-none focus:ring-1 focus:border-gray-800
                  ${showErrors && !newMeeting.type ? 'border-red-500' : 'border-gray-200'}`}
              />
              {showErrors && !newMeeting.type && (
                <p className="text-red-500 text-base md:text-sm mt-0.5">Meeting type is required</p>
              )}
            </div>

            {/* Attendees */}
            <div>
              <label className="block text-base md:text-sm font-semibold text-gray-700 mb-2">
                <Users className="w-4 h-4 inline mr-1" />
                Add Attendees
              </label>
              
              {teamMembers.length === 0 ? (
                <p className="text-base md:text-base text-gray-500 bg-gray-50 p-2 rounded-md">
                  No team members available. Add members to the project first.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                  {teamMembers.map(member => (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 p-2 rounded-md transition-colors text-left cursor-pointer bg-white border border-gray-200 hover:border-gray-300"
                    >
                      <input
                        type="checkbox"
                        checked={newMeeting.attendees.includes(member.id)}
                        onChange={() => toggleAttendee(member.id)}
                        title={`Add ${member.name} to meeting`}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                      <AvatarCircle
                        name={member.name}
                        avatar={member.avatar}
                        size="sm"
                        role={String(member.role).toLowerCase()}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-base md:text-sm font-medium text-gray-800 truncate">
                          {member.name}
                        </div>
                        <div className="text-base md:text-sm text-gray-500 truncate">
                          {member.role}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Selected Attendees Summary */}
              {newMeeting.attendees.length > 0 && (
                <div className="mt-3">
                  <p className="text-base md:text-sm font-semibold text-gray-700 mb-2">Selected Attendees ({newMeeting.attendees.length}):</p>
                  <div className="bg-white border border-gray-200 rounded-md p-2 space-y-1.5">
                    {newMeeting.attendees.map(attendeeId => {
                      const attendee = teamMembers.find(m => m.id === attendeeId);
                      return attendee ? (
                        <div
                          key={attendeeId}
                          className="flex items-center justify-between bg-gray-50 px-2 py-1.5 rounded border border-gray-100"
                        >
                          <div className="flex items-center gap-2">
                            <AvatarCircle
                              name={attendee.name}
                              avatar={attendee.avatar}
                              size="sm"
                              role={String(attendee.role).toLowerCase()}
                            />
                            <div>
                            <div className="text-base md:text-sm font-medium text-gray-800">{attendee.name}</div>
                            <div className="text-base md:text-sm text-gray-500">{attendee.role}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleAttendee(attendee.id)}
                            className="text-red-500 hover:text-red-700 p-0.5"
                            title={`Remove ${attendee.name} from meeting`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-base md:text-sm font-semibold text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                placeholder="Add any notes, decisions, or action items from the meeting"
                value={newMeeting.notes}
                onChange={(e) => setNewMeeting(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-2 py-1.5 text-base md:text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:border-gray-800 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isLoading}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 font-medium text-base md:text-xs hover:bg-gray-50 transition-colors disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || isLoading}
                className="px-3 py-1.5 bg-gray-800 text-white rounded-md font-medium text-base md:text-xs hover:bg-gray-900 transition-colors disabled:opacity-50 flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-gray-800"
              >
                {editingMeeting ? <Edit3 className="w-4 h-4 md:w-3 md:h-3" /> : <Plus className="w-4 h-4 md:w-3 md:h-3" />}
                {isSaving || isLoading 
                  ? 'Saving...' 
                  : editingMeeting 
                    ? 'Update Meeting' 
                    : 'Add Meeting'
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
};

export default MeetingForm;
