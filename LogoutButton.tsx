'use client';
import { createClient } from '../utils/supabase/client';
import { useRouter } from 'next/navigation';

export default function LogoutButton(){const router=useRouter();async function logout(){const supabase=createClient();await supabase.auth.signOut();router.push('/login');router.refresh();}return <button className="btn secondary" onClick={logout}>Logout</button>;}
