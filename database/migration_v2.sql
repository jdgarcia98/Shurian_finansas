-- ============================================================
-- MIGRACIÓN 1: Prevención de Duplicados en expenses
-- ============================================================

-- 1. Agregar columna de número de comprobante/factura
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- 2. Índice UNIQUE parcial: solo cuando hay número de comprobante
--    (el mismo usuario no puede tener dos facturas con el mismo número)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_invoice
ON expenses (user_id, invoice_number)
WHERE invoice_number IS NOT NULL;

-- 3. Índice UNIQUE para el fallback (sin número de comprobante):
--    misma entidad + mismo monto + misma fecha de vencimiento por usuario
--    Solo aplica cuando NO hay invoice_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_expense_fallback
ON expenses (user_id, entity, amount, due_date)
WHERE invoice_number IS NULL;


-- ============================================================
-- MIGRACIÓN 2: Tabla de Suscripciones / Gastos Recurrentes
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    entity       VARCHAR(255) NOT NULL,
    category     VARCHAR(50) NOT NULL CHECK (category IN ('Personal', 'SHURIAN')),
    amount       DECIMAL(12,2) NOT NULL,
    due_day      INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    payment_code TEXT,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger updated_at para subscriptions
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS para subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own subscriptions."
ON subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscriptions."
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions."
ON subscriptions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions."
ON subscriptions FOR DELETE
USING (auth.uid() = user_id);
