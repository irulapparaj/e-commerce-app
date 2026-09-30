import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react';

import { Link as IntlLink } from '@/i18n/navigation';

import { cx } from './cx';
import { Icon, type IconName, type IconSize } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'md' | 'sm';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-control border font-semibold transition-[transform,opacity,background-color,border-color,color] duration-fast ease-out disabled:pointer-events-none disabled:opacity-50';

const SIZES: Readonly<Record<ButtonSize, string>> = {
  md: 'min-h-touch px-5 text-base',
  sm: 'min-h-9 px-3.5 text-small',
};

/** The accent belongs to `primary` only; everything else is ink on the ground. */
const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'border-accent bg-accent text-accent-contrast hover:-translate-y-px active:translate-y-0 active:opacity-90',
  secondary:
    'border-text bg-transparent text-text hover:-translate-y-px hover:bg-surface active:translate-y-0',
  ghost: 'border-transparent bg-transparent text-text hover:border-hairline hover:bg-surface',
  link: 'min-h-0 border-transparent bg-transparent px-0 text-text underline decoration-hairline underline-offset-4 hover:decoration-text',
};

export interface ButtonStyleProps {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly fullWidth?: boolean | undefined;
}

export const buttonClassName = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: ButtonStyleProps): string =>
  cx(
    BASE,
    variant === 'link' ? 'text-base' : SIZES[size],
    VARIANTS[variant],
    fullWidth && 'w-full',
  );

function Spinner() {
  return (
    <span
      aria-hidden="true"
      data-testid="button-spinner"
      className="size-4 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
    />
  );
}

interface ButtonProps
  extends ButtonStyleProps, Omit<ComponentPropsWithRef<'button'>, 'className' | 'children'> {
  readonly children: ReactNode;
  readonly loading?: boolean;
  readonly icon?: IconName;
  readonly iconPosition?: 'start' | 'end';
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  icon,
  iconPosition = 'start',
  children,
  disabled = false,
  type = 'button',
  ...rest
}: ButtonProps) {
  const leading = loading ? <Spinner /> : icon !== undefined && iconPosition === 'start';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      className={buttonClassName({ variant, size, fullWidth })}
      {...rest}
    >
      {leading === true ? <Icon name={icon as IconName} size={16} /> : leading}
      <span>{children}</span>
      {!loading && icon !== undefined && iconPosition === 'end' && <Icon name={icon} size={16} />}
    </button>
  );
}

interface ButtonLinkProps
  extends ButtonStyleProps, Omit<ComponentProps<typeof IntlLink>, 'className' | 'children'> {
  readonly children: ReactNode;
  readonly icon?: IconName;
}

/** A link that looks like a button (hero CTA, "Back to home"). */
export function ButtonLink({ variant, size, fullWidth, icon, children, ...rest }: ButtonLinkProps) {
  return (
    <IntlLink className={buttonClassName({ variant, size, fullWidth })} {...rest}>
      <span>{children}</span>
      {icon !== undefined && <Icon name={icon} size={16} />}
    </IntlLink>
  );
}

interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'className' | 'children'> {
  readonly icon: IconName;
  /** Always required: the icon is the only visible content. */
  readonly label: string;
  readonly size?: 'md' | 'sm';
  readonly iconSize?: IconSize;
  readonly active?: boolean;
  readonly children?: ReactNode;
}

const ICON_BUTTON_SIZES = { md: 'size-touch', sm: 'size-9' } as const;

/** 44 px square target; `children` is for a visually attached badge (cart count). */
export function IconButton({
  icon,
  label,
  size = 'md',
  iconSize = 20,
  active = false,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(
        'relative inline-flex items-center justify-center rounded-control border border-transparent text-text transition-colors duration-fast ease-out hover:border-hairline hover:bg-surface disabled:pointer-events-none disabled:opacity-50',
        ICON_BUTTON_SIZES[size],
        active && 'border-hairline bg-surface',
      )}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
      {children}
    </button>
  );
}
