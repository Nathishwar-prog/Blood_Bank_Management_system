import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  getBloodBotResponse,
  searchBloodShortages,
  getHealthInsight
} from './services/gemini';
import { BloodType, BloodBank, ChatMessage, HealthInsight, Review } from './types';

declare const google: any;

type Role = 'ADMIN' | 'DONOR' | 'PATIENT' | 'STAFF' | 'GUEST';
type DashboardView = 'main' | 'inventory' | 'registration' | 'update_donor' | 'request_blood' | 'screening';

const CRITICAL_THRESHOLD = 5;

// --- Custom Star Component ---
const StarRating: React.FC<{ rating: number, count?: number, size?: 'sm' | 'md' }> = ({ rating, count, size = 'sm' }) => {
  const fullStars = Math.floor(rating);
  const starClass = size === 'sm' ? 'text-[10px]' : 'text-sm';
  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex text-amber-400 ${starClass}`}>
        {[...Array(5)].map((_, i) => (
          <i key={i} className={`${i < fullStars ? 'fa-solid' : 'fa-regular'} fa-star`}></i>
        ))}
      </div>
      {count !== undefined && <span className="text-[10px] font-bold text-slate-400 tracking-tight">({count})</span>}
    </div>
  );
};

// --- Modern Map Component ---
const BloodMap: React.FC<{
  results: BloodBank[],
  userLocation: { lat: number, lng: number } | null,
  selectedBloodType: BloodType,
  onSelectCenter: (center: BloodBank) => void
}> = ({ results, userLocation, selectedBloodType, onSelectCenter }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstance.current) return;
    const initialPos: [number, number] = userLocation ? [userLocation.lat, userLocation.lng] : [12.9716, 77.5946];
    mapInstance.current = L.map(mapContainerRef.current, {
      center: initialPos,
      zoom: 13,
      zoomControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO'
    }).addTo(mapInstance.current);
    markersLayer.current = L.layerGroup().addTo(mapInstance.current);
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !markersLayer.current) return;
    markersLayer.current.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    if (userLocation) {
      const userPos: [number, number] = [userLocation.lat, userLocation.lng];
      L.marker(userPos, {
        icon: L.divIcon({ className: 'custom-div-icon', html: '<div class="user-pulse"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
      }).addTo(markersLayer.current);
      bounds.push(userPos);
    }
    results.forEach(center => {
      const pos: [number, number] = [center.latitude, center.longitude];
      const isLow = center.units_available < CRITICAL_THRESHOLD;
      const bloodIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="marker-glow flex flex-col items-center">
                <i class="fa-solid fa-droplet ${isLow ? 'text-rose-500' : 'text-red-500'} text-4xl drop-shadow-xl"></i>
                <div class="bg-white px-2 py-0.5 rounded-full shadow-sm -mt-2 border border-slate-100">
                  <span class="text-[9px] font-black">${center.units_available}u</span>
                </div>
               </div>`,
        iconSize: [40, 50], iconAnchor: [20, 45]
      });
      const marker = L.marker(pos, { icon: bloodIcon }).addTo(markersLayer.current);
      marker.on('click', () => onSelectCenter(center));
      bounds.push(pos);
    });
    if (bounds.length > 0) mapInstance.current.fitBounds(L.latLngBounds(bounds), { padding: [60, 60], maxZoom: 15 });
  }, [results, userLocation, selectedBloodType]);

  return (
    <div className="w-full bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-white p-2 overflow-hidden relative group">
      <div ref={mapContainerRef} className="w-full h-[350px] md:h-[500px] z-0" />
      <div className="absolute top-6 left-6 z-[1] flex gap-2">
        <div className="glass-card px-4 py-2 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Live Network Status</span>
        </div>
      </div>
    </div>
  );
};

// --- Donor Screening Step Component ---
const DonorScreening: React.FC<{ onPass: () => void, onBack: () => void }> = ({ onPass, onBack }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const screeningQuestions = [
    { id: 'well', q: "Are you currently feeling healthy and well?", fail: "Health must be optimal during donation.", exp: true },
    { id: 'bodyart', q: "Recent tattoo or piercing (last 6 months)?", fail: "Waiting period required for body art.", exp: false },
    { id: 'travel', q: "Recent tropical region travel (last year)?", fail: "Malaria deferral might apply.", exp: false },
    { id: 'weight', q: "Is your weight above 50kg (110 lbs)?", fail: "Weight minimum required for safety.", exp: true }
  ];

  const handleAnswer = (answer: boolean) => {
    if (answer !== screeningQuestions[currentStep].exp) {
      alert(screeningQuestions[currentStep].fail);
      onBack();
      return;
    }
    if (currentStep < screeningQuestions.length - 1) setCurrentStep(currentStep + 1);
    else onPass();
  };

  return (
    <div className="max-w-xl mx-auto py-12 text-center space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-4">
        <div className="w-16 h-1 bg-slate-100 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${((currentStep + 1) / screeningQuestions.length) * 100}%` }}></div>
        </div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">{screeningQuestions[currentStep].q}</h2>
      </div>
      <div className="flex gap-4">
        <button onClick={() => handleAnswer(true)} className="flex-1 py-10 rounded-[2.5rem] bg-emerald-50 border-4 border-emerald-100 text-emerald-700 text-2xl font-black hover:bg-emerald-100 transition-all">YES</button>
        <button onClick={() => handleAnswer(false)} className="flex-1 py-10 rounded-[2.5rem] bg-rose-50 border-4 border-rose-100 text-rose-700 text-2xl font-black hover:bg-rose-100 transition-all">NO</button>
      </div>
      <button onClick={onBack} className="text-slate-400 font-bold hover:text-slate-600">Cancel screening</button>
    </div>
  );
};

// --- Dashboard Component (Bento Grid) ---
const Dashboard: React.FC<{ role: Role, onNavigate: (tab: any) => void, onInternalView: (view: DashboardView) => void }> = ({ role, onNavigate, onInternalView }) => {
  const cards = [
    { id: 'screening', title: 'Enroll Donor', desc: 'Step-by-step safety intake', icon: 'fa-user-plus', color: 'bg-purple-50 text-purple-600', roles: ['ADMIN', 'STAFF'] },
    { id: 'inventory', title: 'Live Inventory', desc: 'Real-time unit management', icon: 'fa-box-archive', color: 'bg-amber-50 text-amber-600', roles: ['ADMIN', 'STAFF'] },
    { id: 'request_blood', title: 'Signal Emergency', desc: 'Broadcast blood request', icon: 'fa-truck-medical', color: 'bg-rose-50 text-rose-600', roles: ['ADMIN', 'STAFF', 'PATIENT'] },
    { id: 'update_donor', title: 'Donor Registry', desc: 'Modify profile details', icon: 'fa-id-card', color: 'bg-blue-50 text-blue-600', roles: ['ADMIN', 'STAFF'] },
    { id: 'health', title: 'Medical Library', desc: 'AI-powered clinical info', icon: 'fa-book-medical', color: 'bg-emerald-50 text-emerald-600', roles: ['ADMIN', 'STAFF', 'DONOR', 'PATIENT'] },
  ];

  const allowedCards = cards.filter(c => c.roles.includes(role));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">Workspace</h2>
          <p className="text-slate-500 font-medium">Hello, {role.toLowerCase()} manager. Accessing secure portals...</p>
        </div>
        <div className="px-4 py-2 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em]">{role} ACCESS</div>
      </div>
      <div className="bento-grid">
        {allowedCards.map(c => (
          <div
            key={c.id}
            onClick={() => c.id === 'health' ? onNavigate('health') : onInternalView(c.id as DashboardView)}
            className="group relative bg-white border border-slate-100 p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all cursor-pointer overflow-hidden"
          >
            <div className={`w-14 h-14 ${c.color} rounded-2xl flex items-center justify-center text-xl mb-6 group-hover:scale-110 transition-transform`}>
              <i className={`fa-solid ${c.icon}`}></i>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-1">{c.title}</h3>
            <p className="text-slate-500 text-sm">{c.desc}</p>
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <i className="fa-solid fa-arrow-right text-slate-300"></i>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main App Component ---
const App: React.FC = () => {
  const [selectedBloodType, setSelectedBloodType] = useState<BloodType>('O+');
  const [sortBy, setSortBy] = useState<'distance' | 'eta'>('distance');
  const [results, setResults] = useState<BloodBank[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'health' | 'dashboard'>('search');
  const [activeRole, setActiveRole] = useState<Role>('GUEST');
  const [dashboardView, setDashboardView] = useState<DashboardView>('main');
  const [selectedCenter, setSelectedCenter] = useState<BloodBank | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => console.warn("Location blocked")
      );
    }
  }, []);

  // --- Authentication State ---
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [authError, setAuthError] = useState<string | null>(null);

  // --- Auth Handlers ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    try {
      const res = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      if (!res.ok) throw new Error('Login failed');
      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
      setActiveRole(data.role);
      setDashboardView('main');
    } catch (err) {
      setAuthError('Invalid credentials');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    try {
      const res = await fetch('http://localhost:8000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      if (!res.ok) throw new Error('Registration failed');
      const data = await res.json();
      alert('Registration successful! Please login.');
      setDashboardView('login');
    } catch (err) {
      setAuthError('Registration failed');
    }
  };

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const res = await fetch('http://localhost:8000/api/search-blood', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          latitude: userLocation?.lat || 12.9716,
          longitude: userLocation?.lng || 77.5946,
          blood_type: selectedBloodType,
          sort_by: sortBy === 'distance' ? 'distance_km' : 'eta_minutes' // fixed enum mismatch if any
        })
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = { role: 'user' as const, text: chatInput, timestamp: new Date() };
    setChatHistory(prev => [...prev, msg]);
    setChatInput('');
    setIsTyping(true);
    try {
      const history = chatHistory.map(h => ({ role: h.role, parts: [{ text: h.text }] }));
      const response = await getBloodBotResponse(chatInput, history);
      setChatHistory(prev => [...prev, { role: 'model', text: response || 'Error', timestamp: new Date() }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-red-100 selection:text-red-900">
      {/* Navigation Header */}
      <header className="glass-card sticky top-0 z-[100] border-b border-slate-200/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center shadow-lg shadow-red-200">
              <i className="fa-solid fa-droplet text-white"></i>
            </div>
            <h1 className="text-xl font-extrabold tracking-tighter text-slate-900">LifeLink <span className="text-red-500">AI</span></h1>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {['search', 'health', 'dashboard'].map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab as any); setDashboardView('main'); }}
                className={`text-sm font-bold capitalize transition-all ${activeTab === tab ? 'text-red-500' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {tab}
              </button>
            ))}
            <select
              value={activeRole}
              onChange={(e) => { setActiveRole(e.target.value as Role); setDashboardView('main'); }}
              className="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold outline-none border-none cursor-pointer"
            >
              {['GUEST', 'ADMIN', 'STAFF', 'DONOR', 'PATIENT'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-10">
        {activeTab === 'search' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Control Sidebar */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Rescue Search</h2>
                  <p className="text-slate-400 text-sm font-medium">Find critical stock matching your type.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Blood Modality</label>
                    <select
                      value={selectedBloodType}
                      onChange={(e) => setSelectedBloodType(e.target.value as BloodType)}
                      className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-red-400 rounded-2xl font-bold transition-all outline-none"
                    >
                      {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSortBy('distance')} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all border-2 ${sortBy === 'distance' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-100 text-slate-400'}`}>DIST-OPT</button>
                    <button onClick={() => setSortBy('eta')} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all border-2 ${sortBy === 'eta' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-100 text-slate-400'}`}>ETA-FAST</button>
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="w-full bg-slate-900 text-white py-5 rounded-[1.8rem] font-bold text-lg shadow-xl hover:bg-slate-800 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-50"
                  >
                    {isSearching ? <i className="fa-solid fa-spinner animate-spin"></i> : "Search Active Stock"}
                  </button>
                </div>
              </div>

              {results.length > 0 && (
                <div className="space-y-4 max-h-[400px] overflow-y-auto scrollbar-hide">
                  {results.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCenter(c)}
                      className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-bold text-slate-800 text-lg group-hover:text-red-500 transition-colors">{c.name}</h3>
                          <StarRating rating={c.rating} count={c.review_count} />
                        </div>
                        <span className={`px-3 py-1 rounded-xl text-[10px] font-black ${c.units_available < CRITICAL_THRESHOLD ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}>
                          {c.units_available} UNITS
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400 text-xs font-bold">
                        <span><i className="fa-solid fa-location-dot text-red-400 mr-1"></i> {c.distance_km} KM</span>
                        <span><i className="fa-solid fa-clock text-blue-400 mr-1"></i> {c.eta_minutes} MIN</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Map Area */}
            <div className="lg:col-span-8">
              <BloodMap results={results} userLocation={userLocation} selectedBloodType={selectedBloodType} onSelectCenter={setSelectedCenter} />
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
            {dashboardView === 'login' && (
              <div className="max-w-md mx-auto space-y-6">
                <h2 className="text-3xl font-black text-slate-800 text-center">Member Access</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                  <input name="email" type="email" placeholder="Email Address" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
                  <input name="password" type="password" placeholder="Password" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
                  <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all">Secure Login</button>
                </form>
                <div className="text-center">
                  <p className="text-slate-400 text-sm font-bold">New organization? <button onClick={() => setDashboardView('register')} className="text-red-500">Register</button></p>
                </div>
                {authError && <div className="p-4 bg-rose-50 text-rose-500 text-center font-bold rounded-2xl">{authError}</div>}
              </div>
            )}

            {dashboardView === 'register' && (
              <div className="max-w-md mx-auto space-y-6">
                <h2 className="text-3xl font-black text-slate-800 text-center">Join Network</h2>
                <form onSubmit={handleRegister} className="space-y-4">
                  <input name="full_name" type="text" placeholder="Full Name / Organization" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
                  <input name="email" type="email" placeholder="Email Address" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
                  <input name="password" type="password" placeholder="Create Password" required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
                  <select name="role" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold">
                    <option value="DONOR">Donor</option>
                    <option value="PATIENT">Patient</option>
                    <option value="STAFF">Hospital Staff</option>
                    <option value="ADMIN">System Admin</option>
                  </select>
                  <button type="submit" className="w-full py-4 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 transition-all">Create Account</button>
                </form>
                <div className="text-center">
                  <p className="text-slate-400 text-sm font-bold">Already a member? <button onClick={() => setDashboardView('login')} className="text-slate-900">Login</button></p>
                </div>
              </div>
            )}

            {dashboardView === 'main' && (
              !token ? (
                <div className="text-center py-20">
                  <i className="fa-solid fa-lock text-5xl text-slate-200 mb-6"></i>
                  <h3 className="text-xl font-bold text-slate-400 uppercase tracking-widest mb-4">Portal Restricted</h3>
                  <button onClick={() => setDashboardView('login')} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Login to Access</button>
                </div>
              ) : (
                <Dashboard role={activeRole} onNavigate={setActiveTab} onInternalView={setDashboardView} />
              )
            )}

            {dashboardView === 'screening' && <DonorScreening onPass={() => setDashboardView('registration')} onBack={() => setDashboardView('main')} />}
            {dashboardView === 'registration' && <div className="p-10 text-center space-y-4"><i className="fa-solid fa-check-circle text-emerald-500 text-5xl"></i><h2 className="text-2xl font-bold">Registration Success</h2><button onClick={() => setDashboardView('main')} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Back home</button></div>}
            {dashboardView !== 'main' && dashboardView !== 'login' && dashboardView !== 'register' && dashboardView !== 'screening' && dashboardView !== 'registration' && (
              <div className="flex flex-col items-center gap-6 py-20">
                <h2 className="text-3xl font-black text-slate-800 capitalize">{dashboardView.replace('_', ' ')} View</h2>
                <p className="text-slate-400">Module content placeholder for MVP.</p>
                <button onClick={() => setDashboardView('main')} className="bg-slate-100 text-slate-600 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all">Go Back</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'health' && (
          <div className="space-y-12 py-10">
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-5xl font-black text-slate-900 tracking-tight">Health Insights</h2>
              <p className="text-slate-500 text-lg">Your clinical knowledge base for blood donation and recovery, powered by advanced medical AI.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {['Iron Absorption', 'Donor Recovery', 'Blood Compatibility', 'Emergency First Aid'].map((t, i) => (
                <div key={i} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group">
                  <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-12 transition-transform">
                    <i className="fa-solid fa-sparkles"></i>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-4">{t}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed mb-6">Learn about biological factors that impact your blood health and donation readiness.</p>
                  <button className="text-red-500 font-bold text-sm flex items-center gap-2 group-hover:gap-4 transition-all">Explore AI Report <i className="fa-solid fa-arrow-right"></i></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Floating Center Detail Side Panel (Glassmorphism) */}
      {selectedCenter && (
        <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-500 max-h-[85vh] overflow-y-auto scrollbar-hide relative border border-white">
            <button onClick={() => setSelectedCenter(null)} className="absolute top-6 right-6 w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors z-[1]">
              <i className="fa-solid fa-xmark"></i>
            </button>
            <div className="p-10 space-y-8">
              <div className="space-y-2">
                <span className="px-3 py-1 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest">Medical Center</span>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{selectedCenter.name}</h3>
                <div className="flex items-center gap-4">
                  <StarRating rating={selectedCenter.rating} count={selectedCenter.review_count} size="md" />
                  <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                  <span className="text-xs font-bold text-slate-400"><i className="fa-solid fa-clock-rotate-left mr-1"></i> Open 24/7</span>
                </div>
              </div>

              <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Unit Availability</h4>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Refreshed just now</span>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {(Object.keys(selectedCenter.inventory) as BloodType[]).map(type => {
                    const isCritical = selectedCenter.inventory[type] < CRITICAL_THRESHOLD;
                    return (
                      <div key={type} className={`p-4 rounded-2xl text-center transition-all ${isCritical ? 'bg-rose-100 border-2 border-rose-200 ring-4 ring-rose-50' : 'bg-white border-2 border-transparent'}`}>
                        <p className={`text-[10px] font-black mb-1 ${isCritical ? 'text-rose-500' : 'text-slate-400'}`}>{type}</p>
                        <p className={`text-xl font-black ${isCritical ? 'text-rose-700' : 'text-slate-800'}`}>{selectedCenter.inventory[type]}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Response Time</p>
                  <p className="text-xl font-black text-blue-900">{selectedCenter.eta_minutes} MINUTES</p>
                </div>
                <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Route Status</p>
                  <p className="text-xl font-black text-emerald-900">CLEAR</p>
                </div>
              </div>

              <div className="flex gap-4">
                <a href={`tel:${selectedCenter.contact_number}`} className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-bold text-center hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  <i className="fa-solid fa-phone"></i> Contact
                </a>
                <a href={selectedCenter.google_maps_url} target="_blank" className="flex-1 py-5 bg-red-500 text-white rounded-2xl font-bold text-center hover:bg-red-600 transition-all shadow-xl shadow-red-100 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-diamond-turn-right"></i> Navigate
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant FAB and Chat Panel */}
      <div className="fixed bottom-8 right-8 z-[120]">
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className={`w-16 h-16 rounded-[1.8rem] shadow-2xl flex items-center justify-center transition-all ${chatOpen ? 'bg-slate-900 text-white' : 'bg-red-500 text-white hover:scale-110 active:scale-95'}`}
        >
          <i className={`fa-solid ${chatOpen ? 'fa-xmark' : 'fa-brain-circuit'} text-xl`}></i>
        </button>

        {chatOpen && (
          <div className="absolute bottom-20 right-0 w-[380px] md:w-[450px] h-[600px] bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-10">
            <div className="bg-slate-900 p-8 text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center">
                  <i className="fa-solid fa-robot"></i>
                </div>
                <div>
                  <h4 className="font-bold text-lg">PulseAI Expert</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Clinical Assistant</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 scrollbar-hide">
              {chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-5 rounded-[1.5rem] text-sm max-w-[85%] font-medium leading-relaxed ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-100 text-slate-700 shadow-sm'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isTyping && <div className="text-[10px] font-black text-slate-300 animate-pulse tracking-widest uppercase ml-2">PulseAI is generating...</div>}
            </div>
            <form onSubmit={handleChatSubmit} className="p-6 bg-white border-t border-slate-100 flex gap-3">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about recovery, iron, or clinics..."
                className="flex-1 bg-slate-50 px-5 py-4 rounded-2xl text-sm focus:outline-none focus:ring-2 ring-red-400/20 transition-all font-medium"
              />
              <button className="bg-red-500 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-red-100 active:scale-95 transition-all">
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </form>
          </div>
        )}
      </div>

      <footer className="py-12 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3 grayscale opacity-50">
            <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-droplet text-white text-xs"></i>
            </div>
            <span className="font-black text-sm tracking-tighter">LifeLink OS v2.0</span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">SECURE CLINICAL NETWORK • ENCRYPTED P2P</p>
          <div className="flex gap-6 text-slate-400">
            <i className="fa-brands fa-github hover:text-slate-900 transition-colors"></i>
            <i className="fa-brands fa-twitter hover:text-slate-900 transition-colors"></i>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
