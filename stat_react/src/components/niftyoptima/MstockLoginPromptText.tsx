import { isMstockLoginPrompt, openMstockLogin } from '../../lib/mstockLogin';

type Props = {
  text: string;
  className?: string;
};

/** Renders login-hint copy as a link that opens the mStock OTP login overlay. */
export function MstockLoginPromptText({ text, className }: Props) {
  if (!isMstockLoginPrompt(text)) {
    return <span className={className}>{text}</span>;
  }
  return (
    <button
      type="button"
      onClick={openMstockLogin}
      className={`${className ?? ''} text-cyan-400 underline hover:text-cyan-300 cursor-pointer text-left`}
    >
      {text}
    </button>
  );
}
