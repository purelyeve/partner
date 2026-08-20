import { requireDistributor } from '@/lib/auth'
import ProfileForm from './profile-form'

export default async function ProfilePage() {
  const { profile, distributor } = await requireDistributor()
  return <ProfileForm profile={profile} distributor={distributor} />
}
