import Image from 'next/image';
import { cn } from '@/lib/utils';

export function ClubLogo({ className, priority = false }) {
  return (
    <span className={cn('relative block h-14 w-11 shrink-0 overflow-hidden rounded-md bg-white', className)}>
      <Image
        src="/club-logo.jpg"
        alt="Centro Sugbo Eagles Club logo"
        fill
        sizes="(min-width: 1024px) 80px, 64px"
        priority={priority}
        className="object-cover"
        style={{ objectPosition: '57% 50%' }}
      />
    </span>
  );
}
