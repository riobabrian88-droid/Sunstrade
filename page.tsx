import { redirect } from 'next/navigation';
import { createClient } from '../../utils/supabase/server';
import LogoutButton from '../../components/LogoutButton';

export default async function Dashboard() {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login');
  const meta=user.user_metadata||{};
  return <main><nav className="nav"><div className="brand">Sunstrade</div><LogoutButton /></nav><div className="container"><h1>Dashboard</h1><p className="muted">Welcome, {meta.name||user.email}.</p><div className="grid"><div className="stat"><h3>Email</h3><p>{user.email}</p></div><div className="stat"><h3>Country</h3><p>{meta.country||'Not set'}</p></div><div className="stat"><h3>Account</h3><p>Authenticated</p></div></div></div></main>;
}
