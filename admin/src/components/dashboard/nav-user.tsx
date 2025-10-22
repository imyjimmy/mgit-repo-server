import { AuthState, GoogleProfile, NostrProfile } from '@/types'
import { useNavigate } from 'react-router-dom';

import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconUserCircle,
} from "@tabler/icons-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

function isGoogleProfile(profile: GoogleProfile | NostrProfile): profile is GoogleProfile {
  return 'firstName' in profile;
}

function getDisplayName(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return 'User';
  
  if (isGoogleProfile(profile)) {
    return `${profile.firstName} ${profile.lastName}`.trim();
  }
  
  return profile.display_name || profile.name || 'User';
}

function getInitials(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return 'U';
  
  if (isGoogleProfile(profile)) {
    const firstInitial = profile.firstName?.[0]?.toUpperCase() || '';
    const lastInitial = profile.lastName?.[0]?.toUpperCase() || '';
    return `${firstInitial}${lastInitial}` || 'U';
  }
  
  // For Nostr profile, take first 2 letters of display_name or name
  const name = profile.display_name || profile.name || 'User';
  return name.slice(0, 2).toUpperCase();
}

function getProfilePicture(profile: GoogleProfile | NostrProfile | null): string | undefined {
  if (!profile) return undefined;
  
  if (isGoogleProfile(profile)) {
    return profile.profilePic;
  }
  
  return profile.picture;
}

function getEmail(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return '';
  
  if (isGoogleProfile(profile)) {
    return profile.email || '';
  }
  
  // For Nostr, could show npub or nip05 if available
  return '';
}

interface NavUserProps {
  authState: AuthState,
  onLogout: () => void
}

export function NavUser({ authState, onLogout }: NavUserProps) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate();

  const displayName = getDisplayName(authState.profile);
  const initials = getInitials(authState.profile);
  const profilePicture = getProfilePicture(authState.profile);
  const email = getEmail(authState.profile);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={profilePicture} alt={displayName} />
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {email || displayName}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={profilePicture} alt={displayName} />
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {email || displayName}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/edit-profile')}>
                <IconUserCircle />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/billing')}>
                <IconCreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
