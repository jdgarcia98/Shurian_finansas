-- Eliminar tabla si ya existía para asegurar entorno limpio en desarrollo
DROP TABLE IF EXISTS expenses;

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Creación de la tabla principal
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    entity VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('Personal', 'SHURIAN')),
    amount DECIMAL(12,2) NOT NULL,
    due_date DATE NOT NULL,
    payment_code TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    pdf_url TEXT,
    notified_24h BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Políticas RLS (Row Level Security) - Solo el usuario dueño puede ver/editar sus registros (y el Service Role / Admin)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own expenses."
ON expenses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own expenses."
ON expenses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own expenses."
ON expenses FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expenses."
ON expenses FOR DELETE
USING (auth.uid() = user_id);

-- Permitir bypass a Service Role (El Admin Key que usa nuestro bot en Python ya bypassa RLS por defecto, pero es buena práctica saber que existe).
