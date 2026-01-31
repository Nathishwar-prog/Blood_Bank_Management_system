
import React, { useState, useEffect, useCallback } from 'react';
import { 
  getBloodBotResponse, 
  searchBloodShortages, 
  findPublicBloodCenters 
} from './services/gemini';
import { BloodType, BloodBank, ChatMessage } from './types';

// Mock data to simulate Backend API responses
const MOCK_CENTERS: BloodBank[] = [
  {
    id: '1',
    name: 'Metropolitan Red Cross',
    address: '123 Healthcare Blvd, Central District',
    latitude: 12.975,
    longitude: 77.601,
    contact_number: '+1-800-BLOOD-01',
    units_available: 12,
    distance_km: 1.2,
    eta_minutes: 5,
    google_maps_url: 'https://maps.google.com'
  },
  {
    id: '2',
    name: 'St. Jude General Hospital',
    address: '45 Medical Lane, East Gate',
    latitude: 12.980,
    longitude: 77.610,
    contact_number: '+1-800-BLOOD-02',
    units_available: 4,
    distance_km: 2.8,
    eta_minutes: 12,
    google_maps_url: 'https://maps.google.com'
  }
];

const App: React.FC = () => {
  const [selectedBloodType, setSelectedBloodType] = useState<BloodType>('O+');
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [results, setResults] = useState<BloodBank[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'info'>('search');
  const [regionalInfo, setRegionalInfo] = useState<string>('');

  // Handle User Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Location access denied", err)
      );
    }
  }, []);

  const handleSearch = async () => {
    setIsSearching(true);
    // Simulate Backend API Call
    setTimeout(() => {
      setResults(MOCK_CENTERS);
      setIsSearching(false);
    }, 1500);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: new Date() };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    try {
      const response = await getBloodBotResponse(chatInput, []);
      const botMsg: ChatMessage = { role: 'model', text: response || 'I am having trouble responding right now.', timestamp: new Date() };
      setChatHistory(prev => [...prev, botMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const fetchRegionalNews = async () => {
    setRegionalInfo('Fetching real-time blood shortage data...');
    try {
      const info = await searchBloodShortages(userLocation ? `${userLocation.lat}, ${userLocation.lng}` : "Current Area");
      setRegionalInfo(info.text);
    } catch (err) {
      setRegionalInfo("Failed to load regional info.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-red-600 text-white shadow-lg sticky top-0 z-50 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-droplet text-2xl animate-pulse"></i>
            <h1 className="text-xl font-bold tracking-tight">LifeLink AI</h1>
          </div>
          <nav className="hidden md:flex gap-6 font-medium">
            <button onClick={() => setActiveTab('search')} className={activeTab === 'search' ? 'border-b-2' : ''}>Find Blood</button>
            <button onClick={() => { setActiveTab('info'); fetchRegionalNews(); }} className={activeTab === 'info' ? 'border-b-2' : ''}>Regional Alerts</button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-8 space-y-8">
        {activeTab === 'search' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Search Panel */}
            <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass text-red-600"></i>
                Emergency Search
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-2">Blood Type Required</label>
                  <select 
                    value={selectedBloodType}
                    onChange={(e) => setSelectedBloodType(e.target.value as BloodType)}
                    className="w-full p-3 border rounded-xl bg-slate-50 focus:ring-2 focus:ring-red-500 outline-none"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-2">Location</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder={userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : "Detecting location..."}
                      disabled
                      className="w-full p-3 pl-10 border rounded-xl bg-slate-100 italic"
                    />
                    <i className="fa-solid fa-location-dot absolute left-3 top-4 text-slate-400"></i>
                  </div>
                </div>

                <button 
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="w-full bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {isSearching ? <i className="fa-solid fa-spinner animate-spin"></i> : "Find Nearby Centers"}
                </button>
              </div>
            </div>

            {/* Results List */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-bold mb-4">Availability Results</h2>
              {results.length > 0 ? (
                results.map(center => (
                  <div key={center.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:border-red-200 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">{center.name}</h3>
                        <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                          <i className="fa-solid fa-map-pin"></i> {center.address}
                        </p>
                      </div>
                      <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        {selectedBloodType} Available
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 border-y border-slate-50 py-4 mb-4">
                      <div className="text-center">
                        <p className="text-xs text-slate-400 font-semibold">DISTANACE</p>
                        <p className="text-lg font-bold text-slate-700">{center.distance_km} km</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-400 font-semibold">ETA</p>
                        <p className="text-lg font-bold text-slate-700">{center.eta_minutes} mins</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-400 font-semibold">STOCK</p>
                        <p className="text-lg font-bold text-green-600">{center.units_available} units</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <a 
                        href={`tel:${center.contact_number}`} 
                        className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-lg text-center font-semibold hover:bg-slate-200"
                      >
                        <i className="fa-solid fa-phone mr-2"></i> Call Center
                      </a>
                      <a 
                        href={center.google_maps_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg text-center font-semibold hover:bg-red-100"
                      >
                        <i className="fa-solid fa-route mr-2"></i> Get Route
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-slate-100 border-2 border-dashed border-slate-200 rounded-3xl h-64 flex flex-col items-center justify-center text-slate-400">
                  <i className="fa-solid fa-hospital-user text-4xl mb-3"></i>
                  <p>No search results yet. Start by selecting your blood type.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-4xl mx-auto">
             <h2 className="text-2xl font-bold mb-6 text-slate-800 flex items-center gap-3">
               <i className="fa-solid fa-earth-americas text-blue-500"></i>
               Regional Grounded Insights
             </h2>
             <div className="prose prose-slate max-w-none">
               <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl mb-6">
                 <p className="text-blue-800 text-sm flex items-center gap-2">
                   <i className="fa-solid fa-circle-info"></i>
                   The following data is grounded using Real-Time Google Search to ensure up-to-date accuracy.
                 </p>
               </div>
               <div className="whitespace-pre-wrap leading-relaxed text-slate-600">
                 {regionalInfo || "Select 'Regional Alerts' to fetch grounded data for your location."}
               </div>
             </div>
          </div>
        )}
      </main>

      {/* Floating Chat Bot Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        <button 
          onClick={() => setChatOpen(!chatOpen)}
          className="bg-red-600 text-white w-16 h-16 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center justify-center relative"
        >
          <i className={`fa-solid ${chatOpen ? 'fa-xmark' : 'fa-comment-medical'} text-2xl`}></i>
          {!chatOpen && <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
          </span>}
        </button>

        {chatOpen && (
          <div className="absolute bottom-20 right-0 w-[90vw] md:w-96 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[500px]">
            <div className="bg-red-600 p-4 text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold">LifeLink AI Assistant</h3>
                <p className="text-xs opacity-80">Online | Medically Trained Bot</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {chatHistory.length === 0 && (
                <div className="text-center py-8">
                  <i className="fa-solid fa-robot text-slate-300 text-4xl mb-2"></i>
                  <p className="text-sm text-slate-500">How can I assist you today? Ask me about blood types, donor eligibility, or finding centers.</p>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-red-600 text-white rounded-tr-none' : 'bg-white text-slate-700 shadow-sm border rounded-tl-none'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl shadow-sm border animate-pulse flex gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleChatSubmit} className="p-4 bg-white border-t flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a health question..."
                className="flex-1 bg-slate-50 border rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button className="bg-red-600 text-white w-10 h-10 rounded-xl flex items-center justify-center">
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </form>
          </div>
        )}
      </div>

      <footer className="p-6 text-center text-slate-400 text-sm bg-white border-t">
        &copy; 2024 LifeLink AI. Designed for Emergency Response.
      </footer>
    </div>
  );
};

export default App;
