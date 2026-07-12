-- Create app_role enum for admin roles
CREATE TYPE public.app_role AS ENUM ('admin', 'clinic_owner');

-- Create clinics table
CREATE TABLE public.clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'عيادتي',
    bot_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create patients table
CREATE TABLE public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create appointments table
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reservation_code TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'trial',
    trial_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create services table
CREATE TABLE public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create user_roles table for admin access
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user's clinic_id
CREATE OR REPLACE FUNCTION public.get_user_clinic_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clinics WHERE owner_id = _user_id LIMIT 1
$$;

-- Create function to generate reservation code
CREATE OR REPLACE FUNCTION public.generate_reservation_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'RE-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
END;
$$;

-- RLS Policies for clinics
CREATE POLICY "Users can view their own clinic" ON public.clinics
FOR SELECT USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own clinic" ON public.clinics
FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own clinic" ON public.clinics
FOR INSERT WITH CHECK (owner_id = auth.uid());

-- RLS Policies for patients
CREATE POLICY "Users can view their clinic patients" ON public.patients
FOR SELECT USING (clinic_id = public.get_user_clinic_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert patients to their clinic" ON public.patients
FOR INSERT WITH CHECK (clinic_id = public.get_user_clinic_id(auth.uid()));

CREATE POLICY "Users can update their clinic patients" ON public.patients
FOR UPDATE USING (clinic_id = public.get_user_clinic_id(auth.uid()));

CREATE POLICY "Users can delete their clinic patients" ON public.patients
FOR DELETE USING (clinic_id = public.get_user_clinic_id(auth.uid()));

-- RLS Policies for appointments
CREATE POLICY "Users can view their clinic appointments" ON public.appointments
FOR SELECT USING (clinic_id = public.get_user_clinic_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert appointments to their clinic" ON public.appointments
FOR INSERT WITH CHECK (clinic_id = public.get_user_clinic_id(auth.uid()));

CREATE POLICY "Users can update their clinic appointments" ON public.appointments
FOR UPDATE USING (clinic_id = public.get_user_clinic_id(auth.uid()));

CREATE POLICY "Users can delete their clinic appointments" ON public.appointments
FOR DELETE USING (clinic_id = public.get_user_clinic_id(auth.uid()));

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their clinic subscription" ON public.subscriptions
FOR SELECT USING (clinic_id = public.get_user_clinic_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update subscriptions" ON public.subscriptions
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert subscriptions" ON public.subscriptions
FOR INSERT WITH CHECK (clinic_id = public.get_user_clinic_id(auth.uid()));

-- RLS Policies for services
CREATE POLICY "Users can view their clinic services" ON public.services
FOR SELECT USING (clinic_id = public.get_user_clinic_id(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert services to their clinic" ON public.services
FOR INSERT WITH CHECK (clinic_id = public.get_user_clinic_id(auth.uid()));

CREATE POLICY "Users can update their clinic services" ON public.services
FOR UPDATE USING (clinic_id = public.get_user_clinic_id(auth.uid()));

CREATE POLICY "Users can delete their clinic services" ON public.services
FOR DELETE USING (clinic_id = public.get_user_clinic_id(auth.uid()));

-- RLS Policies for user_roles
CREATE POLICY "Admins can view all roles" ON public.user_roles
FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON public.user_roles
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own profile" ON public.profiles
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" ON public.profiles
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_clinic_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Create clinic for the user
  INSERT INTO public.clinics (owner_id, name)
  VALUES (NEW.id, 'عيادتي')
  RETURNING id INTO new_clinic_id;
  
  -- Create trial subscription (3 days)
  INSERT INTO public.subscriptions (clinic_id, status, trial_ends_at, is_active)
  VALUES (new_clinic_id, 'trial', NOW() + INTERVAL '3 days', true);
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for appointments
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;