declare module "react" {
  export type ReactNode = any;
  export type FC<P = {}> = (props: P & { children?: ReactNode }) => ReactNode;
  export type ChangeEvent<T = any> = any;
  export type FormEvent<T = any> = any;
  export const Fragment: any;
  export const StrictMode: any;
  export function useState<S>(initialState: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly any[]): T;
  export function useRef<T>(initialValue: T): { current: T };
  export function useContext<T>(context: any): T;
  export function useReducer(...args: any[]): any;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T;
  export const Children: any;
  const React: {
    createElement: (...args: any[]) => any;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "react-dom/client" {
  export function createRoot(container: any): { render(children: any): void };
}

declare module "react-router-dom" {
  export const BrowserRouter: any;
  export const Route: any;
  export const Routes: any;
  export const Link: any;
  export const Navigate: any;
  export function useNavigate(): (path: string, options?: any) => void;
  export function useParams<T extends Record<string, string | undefined>>(): T;
  export function useLocation(): any;
}

declare module "react-firebase-hooks/auth" {
  export function useAuthState(auth: any): [any, boolean, any];
}

declare module "firebase/app" {
  export function initializeApp(config: any): any;
}

declare module "firebase/auth" {
  export const getAuth: any;
  export const signInWithEmailAndPassword: any;
  export const createUserWithEmailAndPassword: any;
  export const updateProfile: any;
  export const signOut: any;
}

declare module "firebase/firestore" {
  export const getFirestore: any;
  export const doc: any;
  export const collection: any;
  export const addDoc: any;
  export const setDoc: any;
  export const updateDoc: any;
  export const deleteDoc: any;
  export const onSnapshot: any;
  export const query: any;
  export const where: any;
  export const orderBy: any;
  export const serverTimestamp: any;
  export const FieldValue: any;
}

declare module "firebase/functions" {
  export const getFunctions: any;
  export const httpsCallable: any;
}

declare module "qrcode.react" {
  export const QRCodeCanvas: any;
}

declare module "@tanstack/react-table" {
  export type ColumnDef<TData, TValue = any> = any;
  export function useReactTable<TData>(config: any): any;
  export function getCoreRowModel(): any;
  export function getFilteredRowModel(): any;
  export function flexRender(...args: any[]): any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [element: string]: any;
    }
  }

  interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
    readonly VITE_FIREBASE_FUNCTIONS_REGION: string;
    readonly VITE_SUBMIT_ATTENDANCE_URL: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

declare module "*";

export {};
