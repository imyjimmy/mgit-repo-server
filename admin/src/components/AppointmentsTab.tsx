import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ArrowPathIcon, Squares2X2Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface TimeSlot {
  time: string;
  hour: number;
}

// interface CalendarEvent {
//   id: string;
//   title: string;
//   start: Date;
//   end: Date;
//   type: 'appointment' | 'unavailability';
// }

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  selectedTime: string | null;
}

const AddEventModal: React.FC<AddEventModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-2xl shadow-xl max-w-md w-full mx-4 border border-gray-700">
        {/* Header */}
        <div className="bg-gray-700 text-white px-6 py-4 rounded-t-2xl flex justify-between items-center border-b border-gray-600">
          <h2 className="text-lg font-semibold tracking-wide">ADD NEW EVENT</h2>
          <button 
            onClick={onClose}
            className="text-gray-300 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <h3 className="text-gray-200 text-lg mb-6">What kind of event would you like to add?</h3>
          
          <div className="space-y-3">
            <button className="w-full py-3 px-4 border-2 border-blue-600 text-blue-400 rounded-lg hover:bg-blue-900 hover:bg-opacity-20 transition-colors font-medium">
              UNAVAILABILITY
            </button>
            
            <button className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
              APPOINTMENT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AppointmentsTab: React.FC = () => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [viewType, setViewType] = useState<'Day' | 'Week' | 'Month'>('Week');
  const [nostrUsername] = useState(() => {
    try {
      const adminProfile = localStorage.getItem('admin_profile');
      if (adminProfile) {
        const profile = JSON.parse(adminProfile);
        return profile.display_name || profile.name || 'Unknown';
      }
    } catch (error) {
      console.error('Error parsing admin_profile:', error);
    }
    return 'Unknown';
  });
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState<{date: Date | null, time: string | null}>({
    date: null,
    time: null
  });
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Generate time slots for 24 hours
  const timeSlots: TimeSlot[] = [];
  for (let hour = 0; hour < 24; hour++) {
    timeSlots.push({
      time: hour === 0 ? '12 am' : hour <= 12 ? `${hour} am` : `${hour - 12} pm`,
      hour
    });
  }

  // Get week dates
  const getWeekDates = (date: Date) => {
    const week = [];
    const startDate = new Date(date);
    const day = startDate.getDay();
    const diff = startDate.getDate() - day;
    startDate.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      week.push(currentDate);
    }
    return week;
  };

  const weekDates = getWeekDates(currentWeek);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Format week range
  const formatWeekRange = () => {
    const start = weekDates[0];
    const end = weekDates[6];
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    
    if (start.getMonth() === end.getMonth()) {
      return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
    } else {
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
    }
  };

  // Navigation functions
  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(currentWeek.getDate() - 7);
    setCurrentWeek(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(currentWeek.getDate() + 7);
    setCurrentWeek(newDate);
  };

  const goToToday = () => {
    setCurrentWeek(new Date());
  };

  // Handle time slot click
  const handleTimeSlotClick = (date: Date, time: string) => {
    setSelectedDateTime({ date, time });
    setShowAddEventModal(true);
  };

  // Check if a time slot is unavailable (for demo purposes)
  const isUnavailable = (date: Date, hour: number) => {
    // Demo unavailability for Monday 8am-11am (consecutive block)
    if (date.getDay() === 1 && hour >= 8 && hour < 11) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    // Scroll to 7am on component mount
    if (scrollContainerRef.current) {
      const scrollTo = 7 * 72; // 7am in pixels (assuming 60px per hour)
      scrollContainerRef.current.scrollTop = scrollTo;
    }
  }, []);

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          {/* Provider Dropdown */}
          <div className="relative">
            <select 
              value={nostrUsername}
              className="bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={nostrUsername}>{nostrUsername}</option>
            </select>
          </div>

          {/* View Options */}
          <div className="flex items-center space-x-2">
            <button className="p-2 text-gray-400 hover:text-white bg-gray-700 rounded">
              <CalendarIcon className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-400 hover:text-white bg-gray-700 rounded">
              <ArrowPathIcon className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-400 hover:text-white bg-gray-700 rounded">
              <Squares2X2Icon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button 
              onClick={goToPreviousWeek}
              className="p-2 text-gray-400 hover:text-white"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={goToNextWeek}
              className="p-2 text-gray-400 hover:text-white"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={goToToday}
              className="px-3 py-1 text-sm text-gray-400 hover:text-white border border-gray-600 rounded"
            >
              Today
            </button>
          </div>

          <div className="text-gray-300 font-medium">
            {formatWeekRange()}
          </div>

          <div className="flex items-center space-x-1">
            {(['Day', 'Week', 'Month'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setViewType(view)}
                className={`px-3 py-1 text-sm rounded ${
                  viewType === view 
                    ? 'bg-gray-600 text-white' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Day Headers */}
        <div className="flex border-b border-gray-700 bg-gray-800">
          <div className="w-20 p-3 text-sm text-gray-400 border-r border-gray-700">
            All Day
          </div>
          {weekDates.map((date, index) => {
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <div key={index} className="flex-1 p-3 text-center border-r border-gray-700 last:border-r-0">
                <div className={`text-sm ${isToday ? 'text-blue-400 font-semibold' : 'text-gray-400'}`}>
                  {dayNames[index]} {date.getMonth() + 1}/{date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable Time Grid */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
        >
          <div className="flex">
            {/* Time Column */}
            <div className="w-20 bg-gray-800">
              {timeSlots.map((slot) => (
                <div 
                  key={slot.hour}
                  className="h-16 flex items-start justify-end pr-2 pt-1 text-xs text-gray-400 border-b border-gray-700"
                >
                  {slot.time}
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {weekDates.map((date, dayIndex) => {
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div key={dayIndex} className={`flex-1 border-r border-gray-700 last:border-r-0 ${isToday ? 'bg-blue-900 bg-opacity-20' : ''}`}>
                  {timeSlots.map((slot) => {
                    const unavailable = isUnavailable(date, slot.hour);
                    
                    // Count consecutive unavailable hours before this one
                    let consecutiveCount = 0;
                    for (let h = slot.hour - 1; h >= 0; h--) {
                      if (isUnavailable(date, h)) {
                        consecutiveCount++;
                      } else {
                        break;
                      }
                    }
                    
                    // Offset even consecutive hours to align stripes
                    const isEvenConsecutive = unavailable && consecutiveCount > 0 && consecutiveCount % 2 === 1;
                    const stripeOffset = isEvenConsecutive ? '0px' : '0px';
                    
                    return (
                      <div
                        key={`${dayIndex}-${slot.hour}`}
                        onClick={() => !unavailable && handleTimeSlotClick(date, slot.time)}
                        className={`h-16 border-b border-gray-700 relative ${
                          unavailable 
                            ? 'bg-gray-600 bg-opacity-50 cursor-not-allowed' 
                            : 'hover:bg-gray-700 cursor-pointer'
                        }`}
                        style={unavailable ? {
                          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.1) 6px, rgba(255,255,255,0.1) 8px)',
                          backgroundPosition: `${stripeOffset} 0`
                        } : {}}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      <AddEventModal 
        isOpen={showAddEventModal}
        onClose={() => setShowAddEventModal(false)}
        selectedDate={selectedDateTime.date}
        selectedTime={selectedDateTime.time}
      />
    </div>
  );
};