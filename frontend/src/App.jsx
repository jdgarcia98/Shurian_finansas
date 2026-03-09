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
    LayoutDashboard,
    Edit2,
    Trash2,
    X,
    Save,
    LogOut,
    RefreshCw
} from 'lucide-react'
import { format, isBefore, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'

// Inicializar cliente Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
    const [session, setSession] = useState(null)
    const [authLoading, setAuthLoading] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isRegistering, setIsRegistering] = useState(false)

    const [expenses, setExpenses] = useState([])
    const [filter, setFilter] = useState('ALL')
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState(null)
    const [isCreating, setIsCreating] = useState(false)
    const [editForm, setEditForm] = useState({})
    const [newExpense, setNewExpense] = useState({
        entity: '',
        amount: '',
        due_date: format(new Date(), 'yyyy-MM-dd'),
        category: 'Personal',
        payment_code: '',
        status: 'pending'
    })

    useEffect(() => {
        // Verificar sesión inicial
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setAuthLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (session) {
            fetchExpenses()
            const subscription = supabase
                .channel('public:expenses')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
                    fetchExpenses()
                })
                .subscribe()

            return () => {
                supabase.removeChannel(subscription)
            }
        }
    }, [session])

    const handleLogin = async (e) => {
        e.preventDefault()
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) alert('Error: ' + error.message)
    }

    const handleSignUp = async (e) => {
        e.preventDefault()
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) alert('Error: ' + error.message)
        else alert('¡Revisá tu mail para confirmar el registro!')
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
    }

    const syncOldExpenses = async () => {
        if (!session) return
        const confirmSync = confirm("Esto vinculará todos los gastos cargados anteriormente a tu cuenta. ¿Continuar?")
        if (!confirmSync) return

        setLoading(true)
        // Intentar actualizar todos los registros que NO tengan user_id
        const { error } = await supabase
            .from('expenses')
            .update({ user_id: session.user.id })
            .is('user_id', null)

        if (error) {
            console.error('Error syncing:', error)
            alert('Error al sincronizar: ' + error.message)
        } else {
            alert('¡Sincronización completada! Tus gastos antiguos ahora deberían ser visibles.')
            fetchExpenses()
        }
        setLoading(false)
    }

    const fetchExpenses = async () => {
        if (!session) return
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

    const startEditing = (expense) => {
        setEditingId(expense.id)
        setEditForm({ ...expense })
    }

    const saveEdit = async () => {
        const { error } = await supabase
            .from('expenses')
            .update({
                entity: editForm.entity,
                amount: parseFloat(editForm.amount),
                due_date: editForm.due_date,
                payment_code: editForm.payment_code
            })
            .eq('id', editingId)

        if (error) {
            console.error('Error saving:', error)
        } else {
            setEditingId(null)
            fetchExpenses()
        }
    }

    const deleteExpense = async (id) => {
        if (!confirm('¿Estás seguro de que querés eliminar este gasto?')) return
        const { error } = await supabase
            .from('expenses')
            .delete()
            .eq('id', id)

        if (error) console.error('Error deleting:', error)
        else fetchExpenses()
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
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

    if (authLoading) {
        return <div className="auth-container"><div className="stat-label">Cargando seguridad...</div></div>
    }

    if (!session) {
        return (
            <div className="auth-container">
                <div className="auth-card glass-card">
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h1 className="title" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>SHURIAN Finance</h1>
                        <p style={{ color: '#94a3b8' }}>{isRegistering ? 'Crear nueva cuenta' : 'Ingresar al Dashboard'}</p>
                    </div>
                    <form onSubmit={isRegistering ? handleSignUp : handleLogin}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label className="stat-label">EMAIL</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label className="stat-label">CONTRASEÑA</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                        </div>
                        <button className="primary" style={{ width: '100%', padding: '1rem', background: 'var(--neon-green)', color: 'black' }}>
                            {isRegistering ? 'Registrarse' : 'Entrar'}
                        </button>
                    </form>
                    <button
                        onClick={() => setIsRegistering(!isRegistering)}
                        style={{ background: 'transparent', color: '#94a3b8', width: '100%', marginTop: '1rem', fontSize: '0.875rem' }}
                    >
                        {isRegistering ? '¿Ya tenés cuenta? Ingresá' : '¿No tenés cuenta? Registrate'}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="dashboard-container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <div>
                    <h1 className="title" style={{ margin: 0 }}>SHURIAN Finance</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                        <p style={{ color: '#94a3b8', margin: 0 }}>{session.user.email}</p>
                        <button onClick={syncOldExpenses} style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--accent-blue)' }}>
                            <RefreshCw size={12} /> SINCRONIZAR DATOS
                        </button>
                        <button onClick={handleLogout} style={{ background: 'transparent', color: '#ef4444', padding: '0 4px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <LogOut size={12} /> CERRAR SESIÓN
                        </button>
                    </div>
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
                <button
                    className="primary"
                    onClick={() => setIsCreating(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--neon-green)', color: 'black' }}
                >
                    <Calendar size={18} /> Nuevo Gasto
                </button>
            </header>

            <AnimatePresence>
                {isCreating && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="glass-card"
                        style={{ marginBottom: '2rem', border: '1px solid var(--neon-green)' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>Cargar Gasto Manual</h2>
                            <button onClick={() => setIsCreating(false)} style={{ background: 'transparent' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <div>
                                <label className="stat-label">ENTIDAD</label>
                                <input
                                    type="text"
                                    placeholder="Ej: EPE, AFIP..."
                                    value={newExpense.entity}
                                    onChange={(e) => setNewExpense({ ...newExpense, entity: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="stat-label">MONTO</label>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={newExpense.amount}
                                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="stat-label">VENCIMIENTO</label>
                                <input
                                    type="date"
                                    value={newExpense.due_date}
                                    onChange={(e) => setNewExpense({ ...newExpense, due_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="stat-label">CATEGORÍA</label>
                                <select
                                    value={newExpense.category}
                                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                                    style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', padding: '0.75rem', borderRadius: '12px', color: 'white', marginTop: '0.5rem' }}
                                >
                                    <option value="Personal">Personal</option>
                                    <option value="SHURIAN">SHURIAN</option>
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label className="stat-label">CÓDIGO DE PAGO (OPCIONAL)</label>
                                <input
                                    type="text"
                                    placeholder="VEP, Banelco, Link..."
                                    value={newExpense.payment_code}
                                    onChange={(e) => setNewExpense({ ...newExpense, payment_code: e.target.value })}
                                />
                            </div>
                        </div>
                        <button
                            className="primary"
                            onClick={async () => {
                                if (!newExpense.entity || !newExpense.amount) return alert('Completá entidad y monto')
                                const { error } = await supabase.from('expenses').insert([{
                                    ...newExpense,
                                    user_id: session.user.id,
                                    amount: parseFloat(newExpense.amount)
                                }])
                                if (error) console.error(error)
                                else {
                                    setIsCreating(false)
                                    setNewExpense({ entity: '', amount: '', due_date: format(new Date(), 'yyyy-MM-dd'), category: 'Personal', payment_code: '', status: 'pending' })
                                    fetchExpenses()
                                }
                            }}
                            style={{ marginTop: '2rem', width: '100%', background: 'var(--neon-green)', color: 'black' }}
                        >
                            Guardar Gasto
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

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
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <button onClick={() => startEditing(expense)} style={{ background: 'transparent', padding: '4px' }}>
                                        <Edit2 size={14} style={{ color: '#94a3b8' }} />
                                    </button>
                                    <button onClick={() => deleteExpense(expense.id)} style={{ background: 'transparent', padding: '4px' }}>
                                        <Trash2 size={14} style={{ color: '#ef4444' }} />
                                    </button>
                                    <span className={expense.status === 'paid' ? 'neon-green' : 'neon-red'} style={{ fontWeight: 700, fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                                        {expense.status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                                    </span>
                                </div>
                            </div>

                            {editingId === expense.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <input
                                        type="text"
                                        value={editForm.entity}
                                        onChange={(e) => setEditForm({ ...editForm, entity: e.target.value })}
                                    />
                                    <input
                                        type="number"
                                        value={editForm.amount}
                                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                                    />
                                    <input
                                        type="date"
                                        value={editForm.due_date}
                                        onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Código de pago"
                                        value={editForm.payment_code || ''}
                                        onChange={(e) => setEditForm({ ...editForm, payment_code: e.target.value })}
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        <button className="primary" onClick={saveEdit} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                            <Save size={16} /> Guardar
                                        </button>
                                        <button onClick={() => setEditingId(null)} style={{ background: '#374151', color: 'white' }}>
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
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
                                            style={{ width: '100%', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--accent-blue)' }}
                                            onClick={() => markAsPaid(expense.id)}
                                        >
                                            <CheckCircle2 size={18} />
                                            Marcar como Pagado
                                        </button>
                                    )}
                                </>
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
