
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

const StarRating: React.FC<{ rating: number, count?: number, size?: 'sm' | 'md' }> = ({ rating, count, size = 'sm' }) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const starClass = size === 'sm' ? 'text-[10px]' : 'text-sm';
  
  return (
    <div className="flex items-center gap-1">
      <div className={`flex text-amber-400 ${starClass}`}>
        {[...Array(5)].map((_, i) => {
          if (i < fullStars) return <i key={i} className="fa-solid fa-star"></i>;
          if (i === fullStars && hasHalfStar) return <i key={i} className="fa-solid fa-star-half-stroke"></i>;
          return <i key={i} className="fa-regular fa-star"></i>;
        })}
      </div>
      {count !== undefined && <span className="text-[10px] font-bold text-slate-400">({count})</span>}
    </div>
  );
};

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
    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance.current);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO'
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
      const userIcon = L.divIcon({ className: 'custom-div-icon', html: '<div class="user-pulse"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
      L.marker(userPos, { icon: userIcon }).addTo(markersLayer.current).bindPopup('<b>Your Location</b>');
      bounds.push(userPos);
    }
    results.forEach(center => {
      const pos: [number, number] = [center.latitude, center.longitude];
      let statusColor = 'bg-rose-500';
      if (center.units_available > 10) statusColor = 'bg-emerald-500';
      else if (center.units_available > 0) statusColor = 'bg-amber-500';
      const bloodIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="relative flex items-center justify-center cursor-pointer"><i class="fa-solid fa-droplet text-red-600 text-4xl drop-shadow-md"></i><div class="absolute -top-1 -right-1 w-3.5 h-3.5 ${statusColor} border-2 border-white rounded-full shadow-sm"></div></div>`,
        iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -40]
      });
      
      const marker = L.marker(pos, { icon: bloodIcon }).addTo(markersLayer.current);
      marker.on('click', () => {
        onSelectCenter(center);
      });
      bounds.push(pos);
    });
    if (bounds.length > 0) mapInstance.current.fitBounds(L.latLngBounds(bounds), { padding: [60, 60], maxZoom: 15 });
  }, [results, userLocation, selectedBloodType, onSelectCenter]);

  return (
    <div className="w-full bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
        <h3 className="font-bold flex items-center gap-2 text-slate-700"><i className="fa-solid fa-map-location-dot text-red-600"></i>Interactive Network</h3>
        <p className="text-[10px] text-slate-400 font-bold uppercase">Click marker for details</p>
      </div>
      <div ref={mapContainerRef} className="w-full h-[300px] md:h-[400px] z-0" />
    </div>
  );
};

// --- Donor Screening Component ---
interface DonorScreeningProps {
  onPass: () => void;
  onBack: () => void;
}
const DonorScreening: React.FC<DonorScreeningProps> = ({ onPass, onBack }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [failedIndices, setFailedIndices] = useState<number[]>([]);

  const screeningQuestions = [
    {
      id: 'well',
      question: "Are you currently feeling healthy and well?",
      subtext: "You should be able to perform your daily activities without issues.",
      failMessage: "Donors must be in good health at the time of donation.",
      expected: true
    },
    {
      id: 'bodyart',
      question: "Have you had a tattoo, piercing, or permanent makeup in the last 6 months?",
      subtext: "Recent body art requires a mandatory waiting period for safety.",
      failMessage: "A 6-month wait is required after tattoos or piercings to ensure safety.",
      expected: false
    },
    {
      id: 'travel',
      question: "Have you traveled to a malaria-endemic region in the last 12 months?",
      subtext: "Including tropical regions where malaria is prevalent.",
      failMessage: "A 12-month deferral is standard after travel to malaria-endemic areas.",
      expected: false
    },
    {
      id: 'antibiotics',
      question: "Are you currently taking antibiotics for an active infection?",
      subtext: "Infections must be fully cleared before donating.",
      failMessage: "You must finish your antibiotic course and be symptom-free for at least 48 hours.",
      expected: false
    },
    {
      id: 'weight',
      question: "Is your current weight above 50kg (110 lbs)?",
      subtext: "Minimum weight requirements ensure donor safety.",
      failMessage: "Donors must meet the minimum weight requirement for their own well-being.",
      expected: true
    }
  ];

  const handleAnswer = (answer: boolean) => {
    const q = screeningQuestions[currentStep];
    const newAnswers = { ...answers, [q.id]: answer };
    setAnswers(newAnswers);

    const isFail = answer !== q.expected;
    const newFailedIndices = isFail ? [...failedIndices, currentStep] : failedIndices;
    setFailedIndices(newFailedIndices);

    if (currentStep < screeningQuestions.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // End of screening
      setCurrentStep(screeningQuestions.length);
    }
  };

  const isEligible = failedIndices.length === 0 && Object.keys(answers).length === screeningQuestions.length;

  if (currentStep === screeningQuestions.length) {
    return (
      <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 py-6">
        <div className="text-center space-y-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl shadow-lg ${isEligible ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
            <i className={`fa-solid ${isEligible ? 'fa-check' : 'fa-xmark'}`}></i>
          </div>
          <h3 className="text-3xl font-black text-slate-800">{isEligible ? 'Screening Passed' : 'Ineligible for Donation'}</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            {isEligible 
              ? "Based on your responses, you are currently eligible to proceed with registration." 
              : "Unfortunately, you do not meet the criteria for donation at this time."}
          </p>
        </div>

        {!isEligible && (
          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Reason(s) for Deferral:</h4>
            <ul className="space-y-3">
              {failedIndices.map(idx => (
                <li key={idx} className="flex gap-3 text-sm text-slate-600 items-start">
                  <i className="fa-solid fa-circle-exclamation text-rose-500 mt-1"></i>
                  <span>{screeningQuestions[idx].failMessage}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 pt-6">
          <button onClick={onBack} className="flex-1 py-4 border-2 border-slate-200 text-slate-500 rounded-2xl font-bold hover:bg-slate-50 transition-all">
            Return to Dashboard
          </button>
          {isEligible && (
            <button onClick={onPass} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-100">
              Complete Registration
            </button>
          )}
        </div>
      </div>
    );
  }

  const q = screeningQuestions[currentStep];
  const progress = ((currentStep) / screeningQuestions.length) * 100;

  return (
    <div className="space-y-8 max-w-2xl mx-auto py-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-800 font-bold text-sm flex items-center gap-2">
          <i className="fa-solid fa-arrow-left"></i> Cancel Screening
        </button>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step {currentStep + 1} of {screeningQuestions.length}</span>
      </div>

      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-red-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 space-y-8 text-center animate-in slide-in-from-right-4 duration-300">
        <div className="space-y-3">
          <h3 className="text-2xl font-black text-slate-800 leading-tight">{q.question}</h3>
          <p className="text-slate-500">{q.subtext}</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 pt-4">
          <button 
            onClick={() => handleAnswer(true)} 
            className="flex-1 py-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-xl font-black text-slate-800 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
          >
            Yes
          </button>
          <button 
            onClick={() => handleAnswer(false)} 
            className="flex-1 py-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-xl font-black text-slate-800 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition-all"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Inventory Manager Component ---
interface InventoryManagerProps {
  onBack: () => void;
}
const InventoryManager: React.FC<InventoryManagerProps> = ({ onBack }) => {
  const [inventory, setInventory] = useState<Record<BloodType, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    const fetchLatestInventory = async () => {
      setLoading(true);
      try {
        await new Promise(r => setTimeout(r, 1200));
        const mockBackendData: Record<BloodType, number> = {
          'A+': 22, 'A-': 3, 'B+': 14, 'B-': 1,
          'O+': 28, 'O-': 4, 'AB+': 5, 'AB-': 0
        };
        setInventory(mockBackendData);
        setLastSynced(new Date().toLocaleTimeString());
      } catch (err) {
        console.error("Fetch failed", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLatestInventory();
  }, []);

  const updateUnits = (type: BloodType, delta: number) => {
    if (!inventory) return;
    setInventory(prev => ({ 
      ...prev!, 
      [type]: Math.max(0, (prev![type] || 0) + delta) 
    }));
  };

  const handleSave = async () => {
    if (!inventory) return;
    setIsSaving(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      setLastSynced(new Date().toLocaleTimeString());
      alert("Inventory database synchronized successfully.");
    } catch (e) {
      alert("Error syncing with regional database. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return (
    <div className="py-24 text-center space-y-4">
      <i className="fa-solid fa-sync fa-spin text-4xl text-amber-500"></i>
      <p className="text-slate-500 font-bold animate-pulse">Syncing with Regional Inventory...</p>
    </div>
  );

  const criticalShortages = inventory ? (Object.keys(inventory) as BloodType[]).filter(t => inventory[t] < CRITICAL_THRESHOLD) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm">
          <i className="fa-solid fa-arrow-left"></i> Back to Dashboard
        </button>
        <div className="flex items-center gap-4 bg-slate-50 p-2 pr-4 rounded-2xl border">
           <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
             <i className="fa-solid fa-hospital"></i>
           </div>
           <div>
             <h3 className="font-bold text-slate-800 text-sm">Metropolitan Red Cross</h3>
             <p className="text-[10px] text-slate-400 font-bold uppercase">Last Sync: {lastSynced}</p>
           </div>
        </div>
      </div>

      {criticalShortages.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div>
            <p className="text-sm font-black text-rose-700">Critical Shortages Detected</p>
            <p className="text-xs text-rose-600">Inventory for {criticalShortages.join(', ')} is below safe operational threshold ({CRITICAL_THRESHOLD} units).</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {inventory && (Object.keys(inventory) as BloodType[]).map(type => {
          const isCritical = inventory[type] < CRITICAL_THRESHOLD;
          return (
            <div key={type} className={`bg-white border rounded-[2rem] p-6 shadow-sm transition-all group ${isCritical ? 'border-rose-200 ring-2 ring-rose-50' : 'hover:border-amber-200'}`}>
              <div className="flex justify-between items-start mb-4">
                 <div className="flex flex-col">
                   <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs mb-2">{type}</span>
                   {isCritical && (
                     <span className="text-[8px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full uppercase flex items-center gap-1 w-fit">
                       <i className="fa-solid fa-triangle-exclamation"></i> Critical
                     </span>
                   )}
                 </div>
                 <div className="text-right">
                   <span className={`text-2xl font-black block leading-none ${inventory[type] > 10 ? 'text-emerald-500' : inventory[type] >= CRITICAL_THRESHOLD ? 'text-amber-500' : 'text-rose-600'}`}>
                     {inventory[type]}
                   </span>
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Units</span>
                 </div>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => updateUnits(type, -1)} className="flex-1 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 h-12 rounded-xl flex items-center justify-center text-slate-400 transition-all border border-transparent hover:border-rose-100"><i className="fa-solid fa-minus"></i></button>
                 <button onClick={() => updateUnits(type, 1)} className="flex-1 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-600 h-12 rounded-xl flex items-center justify-center text-slate-400 transition-all border border-transparent hover:border-emerald-100"><i className="fa-solid fa-plus"></i></button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100">
         <p className="text-xs text-slate-400 max-w-sm">
           <i className="fa-solid fa-circle-info mr-1"></i> Changes will be reflected across the search network immediately after commitment.
         </p>
         <button 
           onClick={handleSave} 
           disabled={isSaving} 
           className="w-full md:w-auto bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50"
         >
           {isSaving ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>} 
           Commit to Network
         </button>
      </div>
    </div>
  );
};

// --- Health Insights Center ---
const HealthCenter: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [insight, setInsight] = useState<HealthInsight | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInsight = async (t: string) => {
    setLoading(true);
    try {
      const data = await getHealthInsight(t);
      setInsight(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = ['Anemia Recovery', 'Iron-Rich Foods', 'Donation Eligibility', 'Post-Donation Care'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <h2 className="text-3xl font-black text-slate-800">Health Knowledge Hub</h2>
        <p className="text-slate-500">Explore clinical insights and health tips powered by LifeLink AI.</p>
        <div className="flex gap-2">
          <input 
            type="text" 
            value={topic} 
            onChange={e => setTopic(e.target.value)}
            placeholder="Search health topics..." 
            className="flex-1 p-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-red-400 focus:outline-none transition-all"
          />
          <button 
            onClick={() => fetchInsight(topic)}
            disabled={loading || !topic}
            className="bg-slate-900 text-white px-8 rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {loading ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-magnifying-glass"></i>}
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map(s => (
            <button key={s} onClick={() => { setTopic(s); fetchInsight(s); }} className="px-4 py-2 bg-slate-50 text-slate-500 rounded-full text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-all border border-slate-200 hover:border-red-100">{s}</button>
          ))}
        </div>
      </div>

      {insight && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4">
          <div className="p-8 md:p-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-10 border-b">
              <div>
                <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 inline-block">{insight.category}</span>
                <h3 className="text-4xl font-black text-slate-800">{insight.title}</h3>
              </div>
              <div className="md:w-72 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <p className="text-[10px] text-amber-800 font-black uppercase mb-1 flex items-center gap-1"><i className="fa-solid fa-circle-exclamation"></i> Disclaimer</p>
                <p className="text-[10px] text-amber-900 leading-relaxed font-bold">{insight.disclaimer}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-8">
                <div className="text-slate-600 leading-relaxed text-lg whitespace-pre-wrap">{insight.content}</div>
              </div>
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">Actionable Tips</h4>
                  <ul className="space-y-4">
                    {insight.tips.map((tip, i) => (
                      <li key={i} className="flex gap-3 text-sm text-slate-600">
                        <i className="fa-solid fa-check text-emerald-500 mt-1"></i>
                        <span className="font-medium">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Donor Enrollment Form ---
const DonorRegistrationForm: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      alert("New donor registered successfully.");
      onBack();
    }, 1500);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm">
        <i className="fa-solid fa-arrow-left"></i> Back to Dashboard
      </button>
      <div className="bg-white border rounded-[2rem] p-10 shadow-sm">
        <div className="flex items-center gap-3 mb-8">
           <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><i className="fa-solid fa-shield-check"></i></div>
           <div>
             <h3 className="text-2xl font-black text-slate-800">Final Enrollment</h3>
             <p className="text-xs text-slate-400 font-bold uppercase">Safety Screening Complete</p>
           </div>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Full Name</label>
            <input required type="text" className="w-full p-4 bg-slate-50 border rounded-2xl focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Email Address</label>
            <input required type="email" className="w-full p-4 bg-slate-50 border rounded-2xl focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Blood Type</label>
            <select required className="w-full p-4 bg-slate-50 border rounded-2xl focus:outline-none">
              {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Mobile Number</label>
            <input required type="tel" className="w-full p-4 bg-slate-50 border rounded-2xl focus:outline-none" />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Additional Health Notes</label>
            <textarea className="w-full p-4 bg-slate-50 border rounded-2xl focus:outline-none h-28"></textarea>
          </div>
          <button type="submit" disabled={submitting} className="md:col-span-2 bg-slate-900 text-white py-5 rounded-2xl font-bold shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50">
            {submitting ? 'Registering...' : 'Add to Registry'}
          </button>
        </form>
      </div>
    </div>
  );
};

const ReviewSection: React.FC<{ 
  centerId: string, 
  reviews: Review[], 
  onAddReview: (review: Omit<Review, 'id' | 'date'>) => void 
}> = ({ centerId, reviews, onAddReview }) => {
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [userName, setUserName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddReview({ user_name: userName || 'Anonymous', rating, comment });
    setShowForm(false);
    setComment('');
    setRating(5);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Patient Feedback</h4>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="text-xs font-bold text-red-600 hover:text-red-700 transition-colors"
        >
          {showForm ? 'Cancel' : 'Write a Review'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4 animate-in slide-in-from-top-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Your Name</label>
              <input 
                type="text" 
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="Optional"
                className="w-full p-3 bg-white border rounded-xl focus:outline-none text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase">Rating</label>
              <select 
                value={rating}
                onChange={e => setRating(Number(e.target.value))}
                className="w-full p-3 bg-white border rounded-xl focus:outline-none text-sm font-bold text-amber-500"
              >
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase">Comment</label>
            <textarea 
              required
              rows={2}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Share your experience..."
              className="w-full p-3 bg-white border rounded-xl focus:outline-none text-sm resize-none"
            />
          </div>
          <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm shadow-md">Post Feedback</button>
        </form>
      )}

      <div className="space-y-4">
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-4">No reviews yet. Be the first to share your experience.</p>
        ) : (
          reviews.map(review => (
            <div key={review.id} className="p-4 bg-white border border-slate-50 rounded-2xl shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-700">{review.user_name}</p>
                  <StarRating rating={review.rating} />
                </div>
                <span className="text-[10px] font-bold text-slate-300">{review.date}</span>
              </div>
              <p className="text-xs text-slate-500 italic leading-relaxed">"{review.comment}"</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const CenterDetailPanel: React.FC<{ 
  center: BloodBank, 
  onClose: () => void,
  isFavorite: boolean,
  toggleFavorite: (id: string) => void,
  onAddReview: (centerId: string, review: Omit<Review, 'id' | 'date'>) => void
}> = ({ center, onClose, isFavorite, toggleFavorite, onAddReview }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500 max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-2xl font-black text-slate-800">{center.name}</h3>
                <button 
                  onClick={() => toggleFavorite(center.id)}
                  className={`text-xl transition-all ${isFavorite ? 'text-red-500 scale-110' : 'text-slate-300 hover:text-red-400'}`}
                >
                  <i className={`fa-${isFavorite ? 'solid' : 'regular'} fa-heart`}></i>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-slate-500 text-sm flex items-center gap-2"><i className="fa-solid fa-map-pin text-red-500"></i> {center.address}</p>
                <div className="h-3 w-[1px] bg-slate-200"></div>
                <StarRating rating={center.rating} count={center.review_count} size="md" />
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Complete Inventory</h4>
              <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full uppercase"> threshold: {CRITICAL_THRESHOLD} units</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {(Object.keys(center.inventory) as BloodType[]).map(type => {
                const isCritical = center.inventory[type] < CRITICAL_THRESHOLD;
                return (
                  <div key={type} className={`border rounded-2xl p-3 text-center transition-colors ${isCritical ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                    <p className={`text-[10px] font-black mb-1 ${isCritical ? 'text-rose-400' : 'text-slate-400'}`}>{type}</p>
                    <p className={`font-black ${isCritical ? 'text-rose-600' : center.inventory[type] > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                      {center.inventory[type]}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-5 rounded-3xl">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Response Time</p>
              <p className="font-bold text-slate-800">{center.eta_minutes} Minutes</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Contact</p>
              <p className="font-bold text-slate-800">{center.contact_number}</p>
            </div>
          </div>

          <ReviewSection 
            centerId={center.id} 
            reviews={center.reviews} 
            onAddReview={(rev) => onAddReview(center.id, rev)} 
          />

          <div className="flex gap-3 pt-4 border-t sticky bottom-0 bg-white">
            <a href={`tel:${center.contact_number}`} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold text-center hover:bg-slate-800 transition-all">
              <i className="fa-solid fa-phone mr-2"></i> Call Center
            </a>
            <a href={center.google_maps_url} target="_blank" className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold text-center hover:bg-red-700 transition-all shadow-lg shadow-red-100">
              <i className="fa-solid fa-diamond-turn-right mr-2"></i> Start Route
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ role: Role, onNavigate: (tab: any) => void, onInternalView: (view: DashboardView) => void }> = ({ role, onNavigate, onInternalView }) => {
  if (role === 'GUEST') return <div className="p-8 text-center text-slate-400">Please log in to access the management portal.</div>;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold text-slate-800">Workspace: {role} Portal</h2><RoleBadge role={role} /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div onClick={() => onNavigate('health')} className="bg-white p-6 rounded-3xl border shadow-sm border-blue-100 hover:ring-2 ring-blue-500 transition-all cursor-pointer bg-gradient-to-br from-white to-blue-50">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-500 flex items-center justify-center mb-4 text-xl"><i className="fa-solid fa-stethoscope"></i></div>
          <h3 className="font-bold mb-2">Medical Assistance</h3><p className="text-sm text-slate-500">Get AI guidance on health, recovery, and blood conditions.</p>
        </div>
        {(role === 'ADMIN' || role === 'STAFF') && (
          <>
            <div onClick={() => onInternalView('screening')} className="bg-white p-6 rounded-3xl border shadow-sm border-purple-100 hover:ring-2 ring-purple-500 transition-all cursor-pointer bg-gradient-to-br from-white to-purple-50">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-500 flex items-center justify-center mb-4 text-xl"><i className="fa-solid fa-user-plus"></i></div>
              <h3 className="font-bold mb-2">Enroll New Donor</h3><p className="text-sm text-slate-500">Start the safety screening and intake process for a donor.</p>
            </div>
            <div onClick={() => onInternalView('update_donor')} className="bg-white p-6 rounded-3xl border shadow-sm border-purple-100 hover:ring-2 ring-purple-500 transition-all cursor-pointer bg-gradient-to-br from-white to-purple-50">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-500 flex items-center justify-center mb-4 text-xl"><i className="fa-solid fa-user-pen"></i></div>
              <h3 className="font-bold mb-2">Update Donor Details</h3><p className="text-sm text-slate-500">Modify health status or contact info for existing donors.</p>
            </div>
          </>
        )}
        {(role === 'PATIENT' || role === 'DONOR') && (
          <div onClick={() => onInternalView('request_blood')} className="bg-white p-6 rounded-3xl border shadow-sm border-rose-100 hover:ring-2 ring-rose-500 transition-all cursor-pointer bg-gradient-to-br from-white to-rose-50">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center mb-4 text-xl"><i className="fa-solid fa-file-medical"></i></div>
            <h3 className="font-bold mb-2">Request Blood</h3><p className="text-sm text-slate-500">File an emergency request for specific blood types.</p>
          </div>
        )}
        {(role === 'STAFF' || role === 'ADMIN') && (
          <div onClick={() => onInternalView('inventory')} className="bg-white p-6 rounded-3xl border shadow-sm border-amber-100 hover:ring-2 ring-amber-500 transition-all cursor-pointer bg-gradient-to-br from-white to-amber-50">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-500 flex items-center justify-center mb-4 text-xl"><i className="fa-solid fa-warehouse"></i></div>
            <h3 className="font-bold mb-2">Manage Inventory</h3><p className="text-sm text-slate-500">Update unit counts for all blood types in your center.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const RoleBadge: React.FC<{ role: Role }> = ({ role }) => {
  const colors = {
    ADMIN: 'bg-purple-100 text-purple-600',
    DONOR: 'bg-green-100 text-green-600',
    PATIENT: 'bg-blue-100 text-blue-600',
    STAFF: 'bg-amber-100 text-amber-600',
    GUEST: 'bg-slate-100 text-slate-600'
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[role]}`}>{role}</span>;
};

const DonorUpdateSearch: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [donor, setDonor] = useState<any>(null);
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setTimeout(() => {
      setDonor({ id: 'D-102', name: 'Michael Chen', bloodType: 'O-', email: 'michael@example.com', lastDonation: '2023-11-15' });
      setIsSearching(false);
    }, 1000);
  };
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm"><i className="fa-solid fa-arrow-left"></i> Back</button>
        <h3 className="font-bold text-slate-800 uppercase tracking-tight text-sm">Update Donor Profile</h3>
      </div>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input required type="text" placeholder="Search by name or email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1 p-4 bg-slate-50 border rounded-2xl focus:outline-none" />
        <button type="submit" className="bg-slate-900 text-white px-6 rounded-2xl font-bold"><i className="fa-solid fa-magnifying-glass"></i></button>
      </form>
      {isSearching && <div className="p-12 text-center text-slate-400"><i className="fa-solid fa-circle-notch animate-spin text-2xl"></i></div>}
      {donor && (
        <div className="bg-white border rounded-[2rem] p-8 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-start mb-6">
            <div><h4 className="text-xl font-bold text-slate-800">{donor.name}</h4><p className="text-sm text-slate-500">{donor.email}</p></div>
            <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full font-black text-xs">{donor.bloodType}</span>
          </div>
          <div className="space-y-4">
             <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl"><span className="text-sm font-bold text-slate-500">Last Donation</span><span className="text-sm font-bold text-slate-800">{donor.lastDonation}</span></div>
             <button onClick={() => alert("Profile updated!")} className="w-full py-4 border-2 border-slate-900 rounded-2xl font-bold text-slate-900 hover:bg-slate-900 hover:text-white transition-all">Update Vital Statistics</button>
          </div>
        </div>
      )}
    </div>
  );
};

const BloodRequestForm: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm"><i className="fa-solid fa-arrow-left"></i> Back</button>
      <div className="bg-white border rounded-[2rem] p-8 shadow-sm space-y-6">
        <h3 className="text-2xl font-black text-slate-800">Emergency Request</h3>
        <p className="text-sm text-slate-500">Your request will be broadcasted to all matching LifeLink centers and donors in your region.</p>
        <div className="space-y-4">
           <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Patient Type</label><select className="w-full p-4 bg-slate-50 border rounded-2xl focus:outline-none"><option>O+</option><option>B-</option></select></div>
             <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Urgency</label><select className="w-full p-4 bg-rose-50 border border-rose-100 text-rose-600 font-bold rounded-2xl focus:outline-none"><option>CRITICAL (Immediate)</option><option>High (24hrs)</option></select></div>
           </div>
           <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Hospital / Location</label><input type="text" placeholder="e.g. City General ICU" className="w-full p-4 bg-slate-50 border rounded-2xl focus:outline-none" /></div>
           <button onClick={() => { setSubmitting(true); setTimeout(() => { setSubmitting(false); alert("Request Broadcasted!"); onBack(); }, 1500); }} disabled={submitting} className="w-full bg-red-600 text-white py-5 rounded-[1.5rem] font-bold shadow-xl hover:bg-red-700 transition-all">
             {submitting ? 'Broadcasting...' : 'Signal Emergency Request'}
           </button>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
const App: React.FC = () => {
  const [selectedBloodType, setSelectedBloodType] = useState<BloodType>('O+');
  const [sortBy, setSortBy] = useState<'distance' | 'eta'>('distance');
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [results, setResults] = useState<BloodBank[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'health' | 'dashboard'>('search');
  const [activeRole, setActiveRole] = useState<Role>('GUEST');
  const [dashboardView, setDashboardView] = useState<DashboardView>('main');
  const [shortageAlert, setShortageAlert] = useState<{ text: string, sources: any[] } | null>(null);
  const [isCheckingShortages, setIsCheckingShortages] = useState(false);
  
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('lifelink_favorites');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedCenter, setSelectedCenter] = useState<BloodBank | null>(null);

  useEffect(() => {
    localStorage.setItem('lifelink_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Location access denied", err)
      );
    }
    setChatHistory([{ role: 'model', text: 'Hello! I am LifeLink AI Medical Assistant. How can I help you? (Note: Consult a doctor for medical advice.)', timestamp: new Date() }]);
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const handleSearch = async () => {
    setIsSearching(true); setIsCheckingShortages(true); setShortageAlert(null);
    const MOCK_CENTERS: BloodBank[] = [
      { 
        id: '1', 
        name: 'Metropolitan Red Cross', 
        address: '123 Healthcare Blvd', 
        latitude: 12.975, 
        longitude: 77.601, 
        contact_number: '+1-555-0101', 
        units_available: 12, 
        inventory: { 'A+': 12, 'A-': 3, 'B+': 8, 'B-': 1, 'O+': 20, 'O-': 4, 'AB+': 4, 'AB-': 1 }, 
        distance_km: 1.2, 
        eta_minutes: 5, 
        google_maps_url: 'https://maps.google.com',
        rating: 4.8,
        review_count: 128,
        reviews: [
          { id: 'r1', user_name: 'David Wilson', rating: 5, comment: 'Extremely professional staff and very clean environment.', date: '2 days ago' },
          { id: 'r2', user_name: 'Sarah Connor', rating: 4, comment: 'Good service, but waiting time was a bit long during peak hours.', date: '1 week ago' }
        ]
      },
      { 
        id: '2', 
        name: 'St. Jude Hospital', 
        address: '45 Medical Lane', 
        latitude: 12.980, 
        longitude: 77.610, 
        contact_number: '+1-555-0102', 
        units_available: 4, 
        inventory: { 'A+': 4, 'A-': 0, 'B+': 12, 'B-': 1, 'O+': 15, 'O-': 6, 'AB+': 2, 'AB-': 0 }, 
        distance_km: 2.8, 
        eta_minutes: 12, 
        google_maps_url: 'https://maps.google.com',
        rating: 4.2,
        review_count: 54,
        reviews: [
          { id: 'r3', user_name: 'Michael Bay', rating: 4, comment: 'Prompt emergency support. Highly recommend for urgent needs.', date: '3 days ago' }
        ]
      }
    ];
    searchBloodShortages("the local area").then(res => { setShortageAlert(res); setIsCheckingShortages(false); }).catch(() => setIsCheckingShortages(false));
    setTimeout(() => {
      const updatedResults = MOCK_CENTERS.map(c => ({ ...c, units_available: c.inventory[selectedBloodType] })).sort((a, b) => sortBy === 'distance' ? a.distance_km - b.distance_km : a.eta_minutes - b.eta_minutes);
      setResults(updatedResults); setIsSearching(false);
    }, 1000);
  };

  const handleAddReview = (centerId: string, reviewIn: Omit<Review, 'id' | 'date'>) => {
    const newReview: Review = {
      ...reviewIn,
      id: Math.random().toString(36).substring(7),
      date: 'Just now'
    };

    setResults(prev => prev.map(c => {
      if (c.id === centerId) {
        const updatedReviews = [newReview, ...c.reviews];
        const newAvg = updatedReviews.reduce((acc, r) => acc + r.rating, 0) / updatedReviews.length;
        return { ...c, reviews: updatedReviews, rating: Number(newAvg.toFixed(1)), review_count: updatedReviews.length };
      }
      return c;
    }));

    if (selectedCenter?.id === centerId) {
      const updatedReviews = [newReview, ...(selectedCenter.reviews)];
      const newAvg = updatedReviews.reduce((acc, r) => acc + r.rating, 0) / updatedReviews.length;
      setSelectedCenter({ ...selectedCenter, reviews: updatedReviews, rating: Number(newAvg.toFixed(1)), review_count: updatedReviews.length });
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: new Date() };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput(''); 
    setIsTyping(true);
    
    const history = chatHistory.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    try { 
      const response = await getBloodBotResponse(chatInput, history); 
      setChatHistory(prev => [...prev, { role: 'model', text: response || 'Error.', timestamp: new Date() }]); 
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'model', text: 'Error fetching response.', timestamp: new Date() }]); 
    } finally { 
      setIsTyping(false); 
    }
  };

  const favoriteCenters = results.filter(r => favorites.includes(r.id));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-red-600 text-white shadow-lg sticky top-0 z-50 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3"><i className="fa-solid fa-droplet text-2xl animate-pulse"></i><h1 className="text-xl font-bold tracking-tight">LifeLink AI</h1></div>
          <nav className="hidden md:flex gap-6 font-medium items-center">
            <button onClick={() => { setActiveTab('search'); setDashboardView('main'); }} className={`transition-all ${activeTab === 'search' ? 'border-b-2 border-white pb-1' : 'opacity-80'}`}>Search</button>
            <button onClick={() => { setActiveTab('health'); setDashboardView('main'); }} className={`transition-all ${activeTab === 'health' ? 'border-b-2 border-white pb-1' : 'opacity-80'}`}>Insights</button>
            <button onClick={() => { setActiveTab('dashboard'); setDashboardView('main'); }} className={`transition-all ${activeTab === 'dashboard' ? 'border-b-2 border-white pb-1' : 'opacity-80'}`}>Dashboard</button>
            <div className="flex items-center gap-2 bg-red-700/50 p-1.5 rounded-xl border border-red-500/30">
              <select value={activeRole} onChange={(e) => { setActiveRole(e.target.value as Role); setDashboardView('main'); }} className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer">
                <option value="GUEST" className="text-slate-900">Guest</option><option value="ADMIN" className="text-slate-900">Admin</option><option value="STAFF" className="text-slate-900">Staff</option><option value="DONOR" className="text-slate-900">Donor</option><option value="PATIENT" className="text-slate-900">Patient</option>
              </select>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-8">
        {activeTab === 'search' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><i className="fa-solid fa-magnifying-glass text-red-600"></i>Emergency Search</h2>
                <div className="space-y-4">
                  <select value={selectedBloodType} onChange={(e) => setSelectedBloodType(e.target.value as BloodType)} className="w-full p-3 border rounded-xl bg-slate-50 font-bold">
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => setSortBy('distance')} className={`flex-1 py-3 text-xs font-bold rounded-xl border ${sortBy === 'distance' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white text-slate-500'}`}>Shortest Path</button>
                    <button onClick={() => setSortBy('eta')} className={`flex-1 py-3 text-xs font-bold rounded-xl border ${sortBy === 'eta' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white text-slate-500'}`}>Fastest ETA</button>
                  </div>
                  <button onClick={handleSearch} disabled={isSearching} className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50 transition-all">{isSearching ? <i className="fa-solid fa-spinner animate-spin"></i> : "Find Centers"}</button>
                </div>
              </div>

              {favoriteCenters.length > 0 && (
                <div className="bg-white p-5 rounded-3xl border shadow-sm border-red-50">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-heart text-red-500"></i> Quick Access
                  </h3>
                  <div className="space-y-2">
                    {favoriteCenters.map(center => (
                      <button 
                        key={center.id}
                        onClick={() => setSelectedCenter(center)}
                        className="w-full text-left p-3 hover:bg-slate-50 rounded-2xl transition-colors border border-transparent hover:border-slate-100 flex justify-between items-center group"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-700">{center.name}</p>
                          <StarRating rating={center.rating} />
                        </div>
                        <i className="fa-solid fa-chevron-right text-slate-300 text-[10px] group-hover:translate-x-1 transition-transform"></i>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <BloodMap results={results} userLocation={userLocation} selectedBloodType={selectedBloodType} onSelectCenter={setSelectedCenter} />
            </div>

            <div className="lg:col-span-2 space-y-4">
              {shortageAlert && (
                <div className="p-6 rounded-3xl bg-amber-50 border-2 border-amber-200 shadow-sm animate-in fade-in zoom-in-95">
                  <h3 className="font-black text-slate-800 uppercase tracking-tighter text-sm mb-2"><i className="fa-solid fa-triangle-exclamation text-amber-600 mr-2"></i>Regional Alert</h3>
                  <p className="text-sm text-slate-700 italic mb-4">"{shortageAlert.text}"</p>
                  <div className="flex flex-wrap gap-2">
                    {shortageAlert.sources.map((c: any, i: number) => c.web && <a key={i} href={c.web.uri} target="_blank" className="text-[10px] bg-white border border-amber-200 text-amber-800 px-2 py-1 rounded-full"><i className="fa-solid fa-link mr-1"></i>{c.web.title}</a>)}
                  </div>
                </div>
              )}
              {results.map(c => (
                <div key={c.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-red-100 transition-colors group">
                  <div className="flex justify-between items-start mb-4">
                    <div onClick={() => setSelectedCenter(c)} className="cursor-pointer">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-800 text-lg group-hover:text-red-600 transition-colors">{c.name}</h3>
                        <i className={`fa-${favorites.includes(c.id) ? 'solid' : 'regular'} fa-heart text-xs text-red-500`}></i>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-slate-500"><i className="fa-solid fa-location-dot text-red-400 mr-1"></i> {c.address}</p>
                        <div className="h-2 w-[1px] bg-slate-200"></div>
                        <StarRating rating={c.rating} count={c.review_count} />
                      </div>
                    </div>
                    <span className={`px-4 py-2 ${c.units_available < CRITICAL_THRESHOLD ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-600'} rounded-2xl text-xs font-black`}>
                      {selectedBloodType}: {c.units_available} UNITS
                      {c.units_available < CRITICAL_THRESHOLD && " (CRITICAL)"}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setSelectedCenter(c)} className="flex-1 bg-slate-50 border py-3 rounded-2xl text-center font-bold text-slate-700 hover:bg-slate-100 transition-all">Full Stock</button>
                    <a href={c.google_maps_url} target="_blank" className="flex-1 bg-red-600 text-white py-3 rounded-2xl text-center font-bold shadow-md hover:bg-red-700 transition-all">Route</a>
                  </div>
                </div>
              ))}
              {results.length === 0 && !isSearching && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <i className="fa-solid fa-droplet-slash text-6xl mb-4"></i>
                  <p className="font-bold text-lg">No active stock matches your query</p>
                  <p className="text-sm">Try broadening your search or checking health insights</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'health' && <HealthCenter />}

        {activeTab === 'dashboard' && (
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
            {dashboardView === 'main' ? <Dashboard role={activeRole} onNavigate={setActiveTab} onInternalView={setDashboardView} /> 
            : dashboardView === 'inventory' ? <InventoryManager onBack={() => setDashboardView('main')} />
            : dashboardView === 'screening' ? <DonorScreening onPass={() => setDashboardView('registration')} onBack={() => setDashboardView('main')} />
            : dashboardView === 'registration' ? <DonorRegistrationForm onBack={() => setDashboardView('main')} />
            : dashboardView === 'update_donor' ? <DonorUpdateSearch onBack={() => setDashboardView('main')} />
            : <BloodRequestForm onBack={() => setDashboardView('main')} />}
          </div>
        )}
      </main>

      {/* Floating Center Detail Modal */}
      {selectedCenter && (
        <CenterDetailPanel 
          center={selectedCenter} 
          onClose={() => setSelectedCenter(null)} 
          isFavorite={favorites.includes(selectedCenter.id)}
          toggleFavorite={toggleFavorite}
          onAddReview={handleAddReview}
        />
      )}

      {/* AI Assistant FAB */}
      <div className="fixed bottom-6 right-6 z-50">
        <button onClick={() => setChatOpen(!chatOpen)} className="bg-red-600 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"><i className={`fa-solid ${chatOpen ? 'fa-xmark' : 'fa-headset'} text-xl`}></i></button>
        {chatOpen && (
          <div className="absolute bottom-16 right-0 w-80 md:w-96 bg-white rounded-3xl shadow-2xl border flex flex-col h-[500px] overflow-hidden">
            <div className="bg-red-600 p-4 text-white font-bold flex items-center justify-between"><div className="flex items-center gap-2"><i className="fa-solid fa-robot"></i><span>LifeLink Assistant</span></div></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scrollbar-hide">
              {chatHistory.map((m, i) => (<div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`p-3 rounded-2xl text-sm max-w-[85%] ${m.role === 'user' ? 'bg-red-600 text-white' : 'bg-white border text-slate-700 shadow-sm'}`}>{m.text}</div></div>))}
              {isTyping && <div className="text-xs text-slate-400 italic"><i className="fa-solid fa-spinner animate-spin mr-1"></i> Thinking...</div>}
            </div>
            <form onSubmit={handleChatSubmit} className="p-3 border-t bg-white flex gap-2"><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." className="flex-1 text-sm border rounded-xl px-4 py-2 focus:outline-none" /><button className="bg-red-600 text-white w-10 h-10 rounded-xl flex items-center justify-center"><i className="fa-solid fa-paper-plane"></i></button></form>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
