import 'lucide-react-native';
import 'react-native';

declare module 'lucide-react-native' {
  interface LucideProps {
    className?: string;
  }
}

declare module 'react-native' {
  interface TextInputProps {
    className?: string;
    placeholderClassName?: string;
  }
}

export {};
