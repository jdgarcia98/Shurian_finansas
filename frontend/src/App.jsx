import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
    BarChart3,
    Wallet,
    Store,
    Calendar,
    Clock,
    CheckCircle2,
    AlertCircle,
    Copy,
    LayoutDashboard
} from 'lucide-react'
import { format, isBefore, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'

// Inicializar cliente Supabase desde el Dashboard usando variables de entorno
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
    const [expenses, setExpenses] = useState([])
    const [filter, setFilter] = useState('ALL') // 'ALL', 'Personal', 'SHURIAN'
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchExpenses()

        // Suscribirse a cambios en tiempo real
        const subscription = supabase
            .channel('public:expenses')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
                fetchExpenses()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    }, [])

    const fetchExpenses = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .order('due_date', { ascending: true })

        if (error) console.error('Error fetching expenses:', error)
        else setExpenses(data || [])
        setLoading(false)
    }

    const markAsPaid = async (id) => {
        const { error } = await supabase
            .from('expenses')
            .update({ status: 'paid' })
            .eq('id', id)

        if (error) console.error('Error updating status:', error)
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
        // Podrias agregar un toast aqui
    }

    const filteredExpenses = expenses.filter(e => {
        if (filter === 'ALL') return true
        return e.category === filter
    })

    const totals = expenses.reduce((acc, curr) => {
        if (curr.category === 'Personal') acc.personal += curr.amount
        else acc.shurian += curr.amount
        return acc
    }, { personal: 0, shurian: 0 })

    const nextDue = expenses.find(e => e.status === 'pending')

    return (
        <div className="dashboard-container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <div>
                    <h1 className="title" style={{ margin: 0 }}>SHURIAN Finance</h1>
                    <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Control de gastos inteligente</p>
                </div>
                <div className="glass-card" style={{ padding: '0.75rem 1.5rem', display: 'flex', gap: '1rem', borderRadius: '16px' }}>
                    <button
                        className={filter === 'ALL' ? 'primary' : ''}
                        onClick={() => setFilter('ALL')}
                        style={{ background: filter === 'ALL' ? '' : 'transparent' }}
                    >Dashboard</button>
                    <button
                        className={filter === 'Personal' ? 'primary' : ''}
                        onClick={() => setFilter('Personal')}
                        style={{ background: filter === 'Personal' ? '' : 'transparent' }}
                    >Personal</button>
                    <button
                        className={filter === 'SHURIAN' ? 'primary' : ''}
                        onClick={() => setFilter('SHURIAN')}
                        style={{ background: filter === 'SHURIAN' ? '' : 'transparent' }}
                    >SHURIAN</button>
                </div>
            </header>

            <section className="stats-grid">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.5rem', borderRadius: '12px' }}>
                            <Wallet size={20} className="accent-blue" />
                        </div>
                        <span className="stat-label">TOTAL PERSONAL</span>
                    </div>
                    <span className="stat-value">${totals.personal.toLocaleString('es-AR')}</span>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="stat-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'rgba(168, 85, 247, 0.2)', padding: '0.5rem', borderRadius: '12px' }}>
                            <Store size={20} style={{ color: '#c084fc' }} />
                        </div>
                        <span className="stat-label">TOTAL SHURIAN</span>
                    </div>
                    <span className="stat-value">${totals.shurian.toLocaleString('es-AR')}</span>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="stat-card" style={{ background: 'linear-gradient(135deg, #1e3a8a, #111827)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '0.5rem', borderRadius: '12px' }}>
                            <Clock size={20} style={{ color: 'white' }} />
                        </div>
                        <span className="stat-label" style={{ color: '#cbd5e1' }}>PRÓXIMO VENCIMIENTO</span>
                    </div>
                    <span className="stat-value" style={{ color: 'white' }}>
                        {nextDue ? `${nextDue.entity} (${format(parseISO(nextDue.due_date), 'dd/MM')})` : 'Sin pendientes'}
                    </span>
                </motion.div>
            </section>

            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={20} style={{ color: '#94a3b8' }} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f1f5f9' }}>Vencimientos y Gastos</h2>
            </div>

            <div className="vencimientos-grid">
                <AnimatePresence>
                    {filteredExpenses.map((expense) => (
                        <motion.div
                            key={expense.id}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className={`expense-card glass-card ${expense.status}`}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span className={`badge ${expense.category === 'Personal' ? 'badge-personal' : 'badge-shurian'}`}>
                                    {expense.category.toUpperCase()}
                                </span>
                                <span className={expense.status === 'paid' ? 'neon-green' : 'neon-red'} style={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                    {expense.status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                                </span>
                            </div>

                            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>{expense.entity}</h3>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>${expense.amount.toLocaleString('es-AR')}</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Calendar size={14} />
                                    <span>Vence: {format(parseISO(expense.due_date), 'dd MMMM, yyyy', { locale: es })}</span>
                                </div>
                                {expense.payment_code && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1f2937', padding: '0.5rem', borderRadius: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                                            <AlertCircle size={14} />
                                            <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{expense.payment_code}</span>
                                        </div>
                                        <button onClick={() => copyToClipboard(expense.payment_code)} style={{ background: 'transparent', padding: '4px' }}>
                                            <Copy size={14} className="accent-blue" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {expense.status === 'pending' && (
                                <button
                                    className="primary"
                                    style={{ width: '100%', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                    onClick={() => markAsPaid(expense.id)}
                                >
                                    <CheckCircle2 size={18} />
                                    Marcar como Pagado
                                </button>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <div className="stat-label">Cargando tus finanzas...</div>
                </div>
            )}
        </div>
    )
}
