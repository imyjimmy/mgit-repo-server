import { CalendarCheck, FolderOpen, Video, Settings, Database } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const items = [
  {
    id: "repositories",
    title: "Medical Repositories", 
    icon: FolderOpen,
  },
  // {
  //   id: "booking",
  //   title: "Book Appointment",
  //   icon: CalendarCheck,
  // },
  {
    id: "appointments",
    title: "Appointments",
    icon: CalendarCheck,
  },
  {
    id: "webrtc",
    title: "Telehealth",
    icon: Video,
  },
  {
    id: "billing",
    title: "Billing",
    icon: Settings,
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
  },
  {
    id: "database",
    title: "Database",
    icon: Database,
  }
]

interface AppSidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

export function AppSidebar({ activeSection, onSectionChange }: AppSidebarProps) {
  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="p-4">
          <h1 className="text-lg font-bold text-primary">MGit Admin</h1>
          <p className="text-sm text-muted-foreground">Server Dashboard</p>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton 
                    onClick={() => onSectionChange(item.id)}
                    isActive={activeSection === item.id}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 bg-green-500 rounded-full" />
            <span className="text-xs font-medium">SERVER ONLINE</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Status: Running</div>
            <div>Port: 3003</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}