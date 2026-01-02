import React, { useState, useEffect } from 'react';
import { 
  PieChart, Wallet, CreditCard, Calendar, CheckCircle2, Circle, 
  TrendingUp, TrendingDown, Plane, Plus, Trash2, AlertCircle, 
  Save, Banknote, ArrowUpCircle, Edit2, RotateCcw, Loader2, BarChart3, LogOut
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, writeBatch
} from 'firebase/firestore';

// --- CONFIGURAÇÃO FIREBASE ---

let firebaseConfig;
let appId;

// TRUQUE PARA O VERCEL: Usamos 'window.' para acessar as variáveis globais.
const envConfig = window.__firebase_config;
const envAppId = window.__app_id;

if (envConfig) {
  try {
    firebaseConfig = JSON.parse(envConfig);
  } catch (e) {
    console.error("Erro ao analisar config", e);
  }
  appId = envAppId || 'default-app-id';
} else {
  // --- AQUI ESTÁ O PONTO DE ATENÇÃO ---
  // Substitua os valores abaixo pelos que estão no seu Console do Firebase.
  // Sem isso, o login NÃO funcionará corretamente em novos dispositivos.
  
  firebaseConfig = {
    apiKey: "AIzaSyBo85fOEKZzAIshCAPIKCs4LTrnuCnRbvg",
    authDomain: "planejamento-2026-82a96.firebaseapp.com",
    projectId: "planejamento-2026-82a96",
    storageBucket: "planejamento-2026-82a96.firebasestorage.app",
    messagingSenderId: "161920317938",
    appId: "1:161920317938:web:51b0677afb1a16de23936b"
};
  
  appId = 'planejamento-2026';
}

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const App = () => {
  // --- ESTADO DE AUTENTICAÇÃO E LOADING ---
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DA APLICAÇÃO ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(0);

  // Dados vazios inicialmente (serão preenchidos pelo banco)
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [creditCardExpenses, setCreditCardExpenses] = useState([]);
  const [vacationFund, setVacationFund] = useState({ incomes: [], expenses: [] });
  const [invoiceTotals, setInvoiceTotals] = useState(Array(12).fill(0));

  // --- ESTADOS DE FORMULÁRIO ---
  const [newIncome, setNewIncome] = useState({ name: '', value: '', type: 'fixed', month: 0 });
  const [newExpense, setNewExpense] = useState({ name: '', value: '' });
  const [newCardExpense, setNewCardExpense] = useState({ name: '', value: '', installments: 1, startMonth: 0 });
  const [newVacationIncome, setNewVacationIncome] = useState({ name: '', value: '' });
  const [newVacationExpense, setNewVacationExpense] = useState({ name: '', value: '' });

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // --- EFEITO 1: AUTENTICAÇÃO ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Verifica token interno (Ambiente de Teste/Canvas)
        const internalToken = window.__initial_auth_token;
        if (internalToken) {
          await signInWithCustomToken(auth, internalToken);
        }
      } catch (error) {
        console.error("Erro na autenticação:", error);
      }
    };
    
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // --- TIMEOUT DE SEGURANÇA ---
  // Se o Firebase demorar mais de 5s (ex: erro de config), libera a tela para tentar login manual
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn("Carregamento demorou muito. Liberando tela de login.");
        setLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  // --- HANDLERS DE AUTH ---
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Erro no login:", error);
      alert("Erro ao fazer login: " + error.message + "\n\nDica: Verifique se você substituiu as chaves 'COLE_SUA_API_KEY_AQUI' no código pelas do seu Firebase.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  // --- EFEITO 2: SINCRONIZAÇÃO DE DADOS (Database) ---
  useEffect(() => {
    if (!user) return;

    const basePath = `artifacts/${appId}/users/${user.uid}`;

    const subscribe = (collectionName, setter) => {
      const q = query(collection(db, basePath, collectionName));
      return onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (items.length === 0 && !localStorage.getItem(`seeded_${collectionName}_v4_${user.uid}`)) {
           seedData(collectionName);
           localStorage.setItem(`seeded_${collectionName}_v4_${user.uid}`, 'true');
        } else {
           setter(items);
        }
      }, (err) => console.error(`Erro lendo ${collectionName}:`, err));
    };

    const subscribeDoc = (docName, setter, defaultVal) => {
       return onSnapshot(doc(db, basePath, 'general', docName), (docSnap) => {
         if (docSnap.exists()) {
           setter(docSnap.data().data);
         } else {
           setDoc(doc(db, basePath, 'general', docName), { data: defaultVal });
         }
       });
    };

    const unsubIncomes = subscribe('incomes', setIncomes);
    const unsubExpenses = subscribe('expenses', setExpenses);
    const unsubCredit = subscribe('credit_expenses', setCreditCardExpenses);
    const unsubVacIn = subscribe('vacation_incomes', (data) => setVacationFund(prev => ({ ...prev, incomes: data })));
    const unsubVacOut = subscribe('vacation_expenses', (data) => setVacationFund(prev => ({ ...prev, expenses: data })));
    const unsubTotals = subscribeDoc('invoice_totals', setInvoiceTotals, Array(12).fill(0));

    return () => {
      unsubIncomes(); unsubExpenses(); unsubCredit(); unsubVacIn(); unsubVacOut(); unsubTotals();
    };
  }, [user]);

  // --- FUNÇÃO DE SEED (Popular dados iniciais) ---
  const seedData = async (collectionName) => {
     const basePath = `artifacts/${appId}/users/${user.uid}`;
     const batch = writeBatch(db);
     
     let initialData = [];
     
     if (collectionName === 'expenses') {
       initialData = [
         { name: "Condomínio", value: 2500.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Escola Crianças", value: 4500.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Energia Elétrica", value: 600.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Água / Saneamento", value: 180.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Gás", value: 120.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Internet / TV / Tel", value: 350.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Supermercado (Mensal)", value: 3000.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Feira / Açougue", value: 800.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Combustível", value: 800.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Seguro Auto", value: 450.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Plano de Saúde", value: 1200.00, paidStatus: Array(12).fill(false), overrides: {} },
         { name: "Empregada / Diarista", value: 1800.00, paidStatus: Array(12).fill(false), overrides: {} },
       ];
     } else if (collectionName === 'incomes') {
       initialData = [
         { name: "Rendimento Principal (AE13)", value: 51579.93, type: 'fixed', month: null, overrides: {} }
       ];
     } else if (collectionName === 'credit_expenses') {
       initialData = [
         { name: "Netflix/Spotify (Recorrente)", value: 59.90, installments: 12, startMonth: 0 },
         { name: "Academia (Recorrente)", value: 120.00, installments: 12, startMonth: 0 },
         { name: "Seguro Celular", value: 89.90, installments: 12, startMonth: 0 },
         { name: "Parcela Eletrodoméstico", value: 250.00, installments: 10, startMonth: 0 }, 
       ];
     } else if (collectionName === 'vacation_incomes') {
       initialData = [
        { name: "Terço CES Abril", value: 13739.98 },
        { name: "Férias", value: 9889.09 }
       ];
     } else if (collectionName === 'vacation_expenses') {
       initialData = [
        { name: "Passagens Aéreas", value: 5400.00 },
        { name: "Hospedagem", value: 3200.00 }
       ];
     }

     initialData.forEach(item => {
       const docRef = doc(collection(db, basePath, collectionName));
       batch.set(docRef, item);
     });

     await batch.commit();
  };

  // --- OPERAÇÕES DE BANCO DE DADOS (CRUD) ---
  const saveItem = async (collectionName, item) => {
    if (!user) return;
    const basePath = `artifacts/${appId}/users/${user.uid}`;
    const docRef = item.id 
      ? doc(db, basePath, collectionName, item.id) 
      : doc(collection(db, basePath, collectionName));
    const { id, ...data } = item; 
    await setDoc(docRef, data);
  };

  const deleteItem = async (collectionName, id) => {
    if (!user) return;
    const basePath = `artifacts/${appId}/users/${user.uid}`;
    await deleteDoc(doc(db, basePath, collectionName, id));
  };

  const saveInvoiceTotals = async (newTotals) => {
    if (!user) return;
    const basePath = `artifacts/${appId}/users/${user.uid}`;
    await setDoc(doc(db, basePath, 'general', 'invoice_totals'), { data: newTotals });
  };


  // --- HANDLERS ---

  const togglePaid = (expense) => {
    const newStatus = [...expense.paidStatus];
    newStatus[selectedMonth] = !newStatus[selectedMonth];
    saveItem('expenses', { ...expense, paidStatus: newStatus });
  };

  const handleInvoiceTotalChange = (val) => {
    const newTotals = [...invoiceTotals];
    newTotals[selectedMonth] = parseFloat(val) || 0;
    saveInvoiceTotals(newTotals);
  };

  const addCardExpense = () => {
    if (!newCardExpense.name || !newCardExpense.value) return;
    saveItem('credit_expenses', {
      name: newCardExpense.name,
      value: parseFloat(newCardExpense.value),
      installments: parseInt(newCardExpense.installments),
      startMonth: parseInt(newCardExpense.startMonth)
    });
    setNewCardExpense({ name: '', value: '', installments: 1, startMonth: selectedMonth }); 
  };

  const addIncome = () => {
    if (!newIncome.name || !newIncome.value) return;
    saveItem('incomes', {
      name: newIncome.name,
      value: parseFloat(newIncome.value),
      type: newIncome.type,
      month: newIncome.type === 'variable' ? parseInt(newIncome.month) : null,
      overrides: {}
    });
    setNewIncome({ name: '', value: '', type: 'fixed', month: selectedMonth });
  };

  const addExpense = () => {
    if (!newExpense.name || !newExpense.value) return;
    saveItem('expenses', {
      name: newExpense.name,
      value: parseFloat(newExpense.value),
      paidStatus: Array(12).fill(false),
      overrides: {}
    });
    setNewExpense({ name: '', value: '' });
  };

  const updateIncomeOverride = (income, newValueStr) => {
    const newValue = parseFloat(newValueStr);
    const newOverrides = { ...income.overrides };
    if (isNaN(newValue) || newValue === income.value) {
      delete newOverrides[selectedMonth];
    } else {
      newOverrides[selectedMonth] = newValue;
    }
    saveItem('incomes', { ...income, overrides: newOverrides });
  };

  const resetIncomeOverride = (income) => {
    const newOverrides = { ...income.overrides };
    delete newOverrides[selectedMonth];
    saveItem('incomes', { ...income, overrides: newOverrides });
  };

  const updateExpenseOverride = (expense, newValueStr) => {
    const newValue = parseFloat(newValueStr);
    const newOverrides = { ...expense.overrides } || {};
    if (isNaN(newValue) || newValue === expense.value) {
      delete newOverrides[selectedMonth];
    } else {
      newOverrides[selectedMonth] = newValue;
    }
    saveItem('expenses', { ...expense, overrides: newOverrides });
  };

  const resetExpenseOverride = (expense) => {
    const newOverrides = { ...expense.overrides };
    delete newOverrides[selectedMonth];
    saveItem('expenses', { ...expense, overrides: newOverrides });
  };

  const addVacationIncome = () => {
    if (!newVacationIncome.name || !newVacationIncome.value) return;
    saveItem('vacation_incomes', {
      name: newVacationIncome.name,
      value: parseFloat(newVacationIncome.value)
    });
    setNewVacationIncome({ name: '', value: '' });
  };

  const addVacationExpense = () => {
    if (!newVacationExpense.name || !newVacationExpense.value) return;
    saveItem('vacation_expenses', {
      name: newVacationExpense.name,
      value: parseFloat(newVacationExpense.value)
    });
    setNewVacationExpense({ name: '', value: '' });
  };

  // --- CÁLCULOS GERAIS ---
  const getMonthlyIncome = (monthIndex) => {
    return incomes.reduce((acc, item) => {
      if (item.type === 'fixed') {
        const monthValue = item.overrides && item.overrides[monthIndex] !== undefined
          ? item.overrides[monthIndex]
          : item.value;
        return acc + monthValue;
      }
      if (item.type === 'variable' && item.month === monthIndex) return acc + item.value;
      return acc;
    }, 0);
  };

  const getMonthlyFixedExpenses = (monthIndex) => {
    return expenses.reduce((acc, item) => {
      const monthValue = item.overrides && item.overrides[monthIndex] !== undefined
        ? item.overrides[monthIndex]
        : item.value;
      return acc + monthValue;
    }, 0);
  };

  const getMonthlyCardTotal = (monthIndex) => {
    const activeItems = creditCardExpenses.filter(item => {
      const endMonth = item.startMonth + item.installments;
      return monthIndex >= item.startMonth && monthIndex < endMonth;
    });
    const planned = activeItems.reduce((acc, item) => acc + item.value, 0);
    const manual = invoiceTotals[monthIndex];
    return manual > 0 ? manual : planned;
  };

  const currentMonthlyIncome = getMonthlyIncome(selectedMonth);
  const activeCardExpenses = creditCardExpenses.filter(item => {
      const endMonth = item.startMonth + item.installments;
      return selectedMonth >= item.startMonth && selectedMonth < endMonth;
  }).map(item => ({...item, currentParcel: selectedMonth - item.startMonth + 1}));

  const plannedCardTotal = activeCardExpenses.reduce((acc, item) => acc + item.value, 0);
  const manualInvoiceTotal = invoiceTotals[selectedMonth];
  const finalCardTotal = manualInvoiceTotal > 0 ? manualInvoiceTotal : plannedCardTotal;
  const miscellaneousCardExpenses = Math.max(0, finalCardTotal - plannedCardTotal);

  const totalFixedExpenses = getMonthlyFixedExpenses(selectedMonth);
  const totalMonthExpenses = totalFixedExpenses + finalCardTotal;
  const balance = currentMonthlyIncome - totalMonthExpenses;

  const vacationIncomeTotal = vacationFund.incomes.reduce((acc, item) => acc + item.value, 0);
  const vacationExpenseTotal = vacationFund.expenses.reduce((acc, item) => acc + item.value, 0);
  const vacationBalance = vacationIncomeTotal - vacationExpenseTotal;

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  // --- UI RENDER ---
  const LoginScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
        <div className="bg-emerald-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
          <Wallet size={40} className="text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Planejamento 2026</h1>
        <p className="text-slate-500 mb-8 text-sm">Faça login com Google para acessar e sincronizar seus dados entre dispositivos.</p>
        
        <button 
          onClick={handleGoogleLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-3 shadow-md hover:shadow-lg transform active:scale-95 duration-200"
        >
          <div className="bg-white p-1 rounded-full">
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          </div>
          Entrar com Google
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 gap-2">
        <Loader2 className="animate-spin" /> Carregando...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // --- COMPONENTES VISUAIS (FUNÇÕES) ---

  const renderMonthSelector = () => (
    <div className="flex items-center gap-4 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
      <span className="text-slate-500 text-sm font-medium pl-2">Mês:</span>
      <select 
        value={selectedMonth} 
        onChange={(e) => setSelectedMonth(Number(e.target.value))}
        className="p-2 border-none bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
      >
        {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
      </select>
    </div>
  );

  const renderSidebar = () => (
    <div className="w-full md:w-64 bg-slate-900 text-white flex flex-col p-4 md:h-screen sticky top-0 z-10">
      <div className="mb-8 p-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wallet className="text-emerald-400" /> Finanças 2026
        </h1>
        <div className="text-[10px] text-slate-500 mt-1 truncate">{user.email}</div>
      </div>
      <nav className="flex flex-col gap-2 flex-1">
        {[
          { id: 'dashboard', icon: PieChart, label: 'Visão Geral' },
          { id: 'incomes', icon: Banknote, label: 'Receitas' },
          { id: 'monthly', icon: Calendar, label: 'Despesas Mensais' },
          { id: 'credit', icon: CreditCard, label: 'Gestão Cartão' },
          { id: 'yearly', icon: BarChart3, label: 'Visão Anual' },
          { id: 'vacation', icon: Plane, label: 'Fundo Férias' },
        ].map(item => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`p-3 rounded-lg flex items-center gap-3 transition-colors ${activeTab === item.id ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            <item.icon size={20} /> {item.label}
          </button>
        ))}
      </nav>
      
      <div className="pt-4 border-t border-slate-800">
        <button 
          onClick={handleLogout}
          className="w-full p-3 rounded-lg flex items-center gap-3 text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors"
        >
          <LogOut size={20} /> Sair
        </button>
      </div>
    </div>
  );

  const renderDashboardView = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        {renderMonthSelector()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden group hover:border-emerald-200 transition-colors cursor-pointer" onClick={() => setActiveTab('incomes')}>
          <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp size={100} /></div>
          <div className="text-slate-500 text-sm mb-1 font-medium">Receita Prevista</div>
          <div className="text-3xl font-bold text-slate-800">{formatCurrency(currentMonthlyIncome)}</div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-red-500"><TrendingDown size={100} /></div>
          <div className="text-slate-500 text-sm mb-1 font-medium">Total Despesas</div>
          <div className="text-3xl font-bold text-red-600">{formatCurrency(totalMonthExpenses)}</div>
          <div className="mt-2 text-xs text-slate-500">
             Fixo: {formatCurrency(totalFixedExpenses)} | Cartão: {formatCurrency(finalCardTotal)}
          </div>
        </div>

        <div className={`p-6 rounded-xl shadow-sm border relative overflow-hidden ${balance >= 0 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          <div className="text-white/80 text-sm mb-1 font-medium">Resultado</div>
          <div className="text-3xl font-bold">{formatCurrency(balance)}</div>
        </div>
      </div>
    </div>
  );

  const renderIncomeView = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Gestão de Receitas</h2>
        {renderMonthSelector()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Plus size={20} className="text-emerald-500" /> Nova Entrada
          </h3>
          <div className="space-y-4">
            <input type="text" placeholder="Descrição" value={newIncome.name} onChange={e => setNewIncome({...newIncome, name: e.target.value})} className="w-full p-2 border rounded" />
            <input type="number" placeholder="Valor" value={newIncome.value} onChange={e => setNewIncome({...newIncome, value: e.target.value})} className="w-full p-2 border rounded" />
            <div className="flex gap-2">
              <button onClick={() => setNewIncome({...newIncome, type: 'fixed'})} className={`flex-1 py-2 rounded ${newIncome.type === 'fixed' ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>Fixo</button>
              <button onClick={() => setNewIncome({...newIncome, type: 'variable'})} className={`flex-1 py-2 rounded ${newIncome.type === 'variable' ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>Variável</button>
            </div>
            {newIncome.type === 'variable' && (
              <select value={newIncome.month} onChange={e => setNewIncome({...newIncome, month: parseInt(e.target.value)})} className="w-full p-2 border rounded">
                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            )}
            <button onClick={addIncome} className="w-full bg-emerald-600 text-white font-bold py-2 rounded mt-2">Adicionar</button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b bg-slate-50 font-bold text-slate-700">Receitas Fixas</div>
            <div className="divide-y">
              {incomes.filter(i => i.type === 'fixed').map(item => {
                const isOverridden = item.overrides && item.overrides[selectedMonth] !== undefined;
                return (
                  <div key={item.id} className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-slate-400">Base: {formatCurrency(item.value)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-2 p-1 rounded border ${isOverridden ? 'bg-yellow-50 border-yellow-300' : 'border-transparent'}`}>
                        <span className="text-xs text-slate-400">{months[selectedMonth]}:</span>
                        <input 
                          type="number" 
                          value={isOverridden ? item.overrides[selectedMonth] : item.value}
                          onChange={(e) => updateIncomeOverride(item, e.target.value)}
                          className={`w-24 bg-transparent text-right font-mono font-bold ${isOverridden ? 'text-yellow-700' : 'text-emerald-600'}`}
                        />
                      </div>
                      {isOverridden && <button onClick={() => resetIncomeOverride(item)}><RotateCcw size={16} className="text-slate-400 hover:text-emerald-600"/></button>}
                      <button onClick={() => deleteItem('incomes', item.id)}><Trash2 size={18} className="text-slate-300 hover:text-red-500"/></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
           {/* Receitas Variáveis */}
           <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b bg-slate-50 font-bold text-slate-700">Extras ({months[selectedMonth]})</div>
            <div className="divide-y">
              {incomes.filter(i => i.type === 'variable' && i.month === selectedMonth).map(item => (
                <div key={item.id} className="p-4 flex justify-between items-center">
                  <span className="font-medium">{item.name}</span>
                  <div className="flex gap-4">
                    <span className="font-mono font-bold text-blue-600">{formatCurrency(item.value)}</span>
                    <button onClick={() => deleteItem('incomes', item.id)}><Trash2 size={18} className="text-slate-300 hover:text-red-500"/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMonthlyView = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Despesas Mensais</h2>
        {renderMonthSelector()}
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-bold text-slate-600 mb-2 flex items-center gap-2"><Plus size={16}/> Adicionar Nova Despesa (Fixa/Recorrente)</h3>
        <div className="flex gap-2">
          <input className="flex-1 p-2 rounded bg-slate-50 border" placeholder="Nome (Ex: Clube, Curso)" value={newExpense.name} onChange={e=>setNewExpense({...newExpense, name: e.target.value})} />
          <input className="w-32 p-2 rounded bg-slate-50 border" type="number" placeholder="Valor Base" value={newExpense.value} onChange={e=>setNewExpense({...newExpense, value: e.target.value})} />
          <button onClick={addExpense} className="bg-emerald-600 text-white px-4 rounded font-bold">Salvar</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b bg-slate-50 font-bold text-slate-700 flex justify-between">
          <span>Checklist de Pagamentos</span>
          <span className="text-xs font-normal text-slate-500">Edite o valor se variar este mês</span>
        </div>
        <div className="divide-y">
          {expenses.map((expense) => {
            const isPaid = expense.paidStatus[selectedMonth];
            const isOverridden = expense.overrides && expense.overrides[selectedMonth] !== undefined;
            const currentValue = isOverridden ? expense.overrides[selectedMonth] : expense.value;

            return (
              <div key={expense.id} className={`p-4 flex flex-col sm:flex-row justify-between items-center gap-4 ${isPaid ? 'bg-emerald-50/30' : ''}`}>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <button onClick={() => togglePaid(expense)} className={`p-2 rounded-full transition-all ${isPaid ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}>
                    {isPaid ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                  </button>
                  <div className={`font-medium ${isPaid ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{expense.name}</div>
                </div>
                
                <div className="flex items-center gap-4">
                   <div className={`flex items-center gap-2 p-1 px-2 rounded border ${isOverridden ? 'bg-yellow-50 border-yellow-300' : 'border-transparent hover:border-slate-200'}`}>
                      <span className="text-xs text-slate-400">R$</span>
                      <input 
                        type="number" 
                        value={currentValue}
                        onChange={(e) => updateExpenseOverride(expense, e.target.value)}
                        className={`w-24 bg-transparent text-right font-mono font-bold outline-none ${isOverridden ? 'text-yellow-700' : (isPaid ? 'text-emerald-600' : 'text-slate-700')}`}
                      />
                   </div>
                   {isOverridden && <button onClick={() => resetExpenseOverride(expense)} title="Voltar ao valor original"><RotateCcw size={16} className="text-slate-400 hover:text-emerald-600"/></button>}
                   <button onClick={() => deleteItem('expenses', expense.id)}><Trash2 size={18} className="text-slate-300 hover:text-red-500"/></button>
                </div>
              </div>
            );
          })}
          
          <div className="p-4 flex justify-between bg-indigo-50 border-l-4 border-indigo-400">
            <div className="flex items-center gap-2 pl-2">
              <CreditCard size={20} className="text-indigo-500"/>
              <div className="font-bold text-slate-800">Cartão de Crédito (Total)</div>
            </div>
            <div className="font-mono font-bold text-indigo-700 text-lg">{formatCurrency(finalCardTotal)}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderYearlyView = () => {
    // Calculo de totais para o ano todo
    const yearData = months.map((m, i) => {
      const inc = getMonthlyIncome(i);
      const fix = getMonthlyFixedExpenses(i);
      const card = getMonthlyCardTotal(i);
      const tot = fix + card;
      const bal = inc - tot;
      return { month: m, income: inc, fixed: fix, card: card, total: tot, balance: bal };
    });

    return (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-slate-800">Visão Anual 2026</h2>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Mês</th>
                <th className="px-4 py-3 text-right text-emerald-600">Receita</th>
                <th className="px-4 py-3 text-right">Fixas</th>
                <th className="px-4 py-3 text-right">Cartão</th>
                <th className="px-4 py-3 text-right text-red-600">Total Saídas</th>
                <th className="px-4 py-3 text-right font-bold">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {yearData.map((d, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{d.month}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatCurrency(d.income)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCurrency(d.fixed)}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-600">{formatCurrency(d.card)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600 font-bold">{formatCurrency(d.total)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${d.balance >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                    {formatCurrency(d.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-slate-800">
              <tr>
                <td className="px-4 py-3">TOTAL</td>
                <td className="px-4 py-3 text-right">{formatCurrency(yearData.reduce((a,b)=>a+b.income,0))}</td>
                <td className="px-4 py-3 text-right">-</td>
                <td className="px-4 py-3 text-right">-</td>
                <td className="px-4 py-3 text-right">{formatCurrency(yearData.reduce((a,b)=>a+b.total,0))}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(yearData.reduce((a,b)=>a+b.balance,0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const renderCreditView = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
         <h2 className="text-2xl font-bold text-slate-800">Gestão de Cartão</h2>
         {renderMonthSelector()}
      </div>

      <div className="bg-indigo-600 p-6 rounded-xl shadow-lg text-white">
        <h3 className="font-bold mb-4">Fechamento da Fatura ({months[selectedMonth]})</h3>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs text-indigo-200">Valor Real (App do Banco)</label>
            <div className="flex items-center bg-indigo-700 p-3 rounded border border-indigo-500">
              <span className="mr-2">R$</span>
              <input 
                type="number" 
                value={manualInvoiceTotal || ''} 
                onChange={(e) => handleInvoiceTotalChange(e.target.value)} 
                placeholder={plannedCardTotal.toFixed(2)}
                className="bg-transparent text-white font-bold text-2xl w-full outline-none"
              />
            </div>
          </div>
          <div className="bg-white/10 p-3 rounded flex-1">
            <div className="text-xs text-indigo-200">Previsto (Fixos)</div>
            <div className="font-bold text-lg">{formatCurrency(plannedCardTotal)}</div>
          </div>
          <div className="bg-white text-indigo-900 p-3 rounded flex-1">
            <div className="text-xs font-bold">Avulsos (Calc)</div>
            <div className="font-bold text-lg">{formatCurrency(miscellaneousCardExpenses)}</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl text-white">
        <h3 className="font-bold mb-4 flex gap-2"><Plus size={20} className="text-emerald-400"/> Adicionar Compra</h3>
        <div className="grid grid-cols-5 gap-4 items-end">
           <input className="col-span-2 p-2 rounded bg-slate-700 border-slate-600" placeholder="Descrição" value={newCardExpense.name} onChange={e=>setNewCardExpense({...newCardExpense, name: e.target.value})} />
           <input className="p-2 rounded bg-slate-700 border-slate-600" type="number" placeholder="Valor" value={newCardExpense.value} onChange={e=>setNewCardExpense({...newCardExpense, value: e.target.value})} />
           <input className="p-2 rounded bg-slate-700 border-slate-600" type="number" placeholder="Parc." value={newCardExpense.installments} onChange={e=>setNewCardExpense({...newCardExpense, installments: e.target.value})} />
           <select className="p-2 rounded bg-slate-700 border-slate-600" value={newCardExpense.startMonth} onChange={e=>setNewCardExpense({...newCardExpense, startMonth: e.target.value})}>
             {months.map((m,i)=><option key={i} value={i}>{m}</option>)}
           </select>
        </div>
        <button onClick={addCardExpense} className="mt-4 w-full bg-emerald-600 py-2 rounded font-bold">Adicionar</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-bold mb-4">Itens Cadastrados</h3>
        <div className="divide-y max-h-60 overflow-auto">
          {creditCardExpenses.map(item => (
            <div key={item.id} className="py-3 flex justify-between items-center">
               <div>
                 <div className="font-bold">{item.name}</div>
                 <div className="text-xs text-slate-500">{item.installments}x de {formatCurrency(item.value)}</div>
               </div>
               <button onClick={() => deleteItem('credit_expenses', item.id)}><Trash2 size={18} className="text-slate-300 hover:text-red-500"/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderVacationView = () => (
    <div className="space-y-6 animate-fade-in">
       <div className="flex justify-between items-center">
         <h2 className="text-2xl font-bold text-slate-800">Fundo de Férias</h2>
         <div className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100">Saldo: {formatCurrency(vacationBalance)}</div>
      </div>
      <div className="grid grid-cols-2 gap-6 h-96">
        <div className="bg-white rounded-xl shadow-sm border flex flex-col">
          <div className="p-3 bg-emerald-50 border-b font-bold text-emerald-800">Entradas</div>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {vacationFund.incomes.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span className="flex gap-2 font-mono font-bold text-emerald-600">
                  {formatCurrency(item.value)}
                  <button onClick={() => deleteItem('vacation_incomes', item.id)}><Trash2 size={14} className="text-slate-300 hover:text-red-500"/></button>
                </span>
              </div>
            ))}
          </div>
          <div className="p-3 border-t bg-slate-50 flex gap-2">
            <input placeholder="Desc" value={newVacationIncome.name} onChange={e=>setNewVacationIncome({...newVacationIncome, name: e.target.value})} className="flex-1 text-sm p-1 rounded border"/>
            <input placeholder="R$" type="number" value={newVacationIncome.value} onChange={e=>setNewVacationIncome({...newVacationIncome, value: e.target.value})} className="w-20 text-sm p-1 rounded border"/>
            <button onClick={addVacationIncome} className="bg-emerald-600 text-white p-1 rounded"><Plus size={16}/></button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border flex flex-col">
          <div className="p-3 bg-red-50 border-b font-bold text-red-800">Saídas</div>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {vacationFund.expenses.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span className="flex gap-2 font-mono font-bold text-red-600">
                  {formatCurrency(item.value)}
                  <button onClick={() => deleteItem('vacation_expenses', item.id)}><Trash2 size={14} className="text-slate-300 hover:text-red-500"/></button>
                </span>
              </div>
            ))}
          </div>
          <div className="p-3 border-t bg-slate-50 flex gap-2">
            <input placeholder="Desc" value={newVacationExpense.name} onChange={e=>setNewVacationExpense({...newVacationExpense, name: e.target.value})} className="flex-1 text-sm p-1 rounded border"/>
            <input placeholder="R$" type="number" value={newVacationExpense.value} onChange={e=>setNewVacationExpense({...newVacationExpense, value: e.target.value})} className="w-20 text-sm p-1 rounded border"/>
            <button onClick={addVacationExpense} className="bg-red-600 text-white p-1 rounded"><Plus size={16}/></button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 font-sans text-slate-800">
      {renderSidebar()}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'dashboard' && renderDashboardView()}
          {activeTab === 'incomes' && renderIncomeView()}
          {activeTab === 'monthly' && renderMonthlyView()}
          {activeTab === 'yearly' && renderYearlyView()}
          {activeTab === 'credit' && renderCreditView()}
          {activeTab === 'vacation' && renderVacationView()}
        </div>
      </main>
    </div>
  );
};

export default App;
