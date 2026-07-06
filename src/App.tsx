import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from "react";
import { toPng } from "html-to-image";
import { cn } from "@/utils/cn";

type Step = "landing" | "setup" | "designer" | "studio" | "declined";
type Gender = "male" | "female";

type PreviewStyle = {
  hair: string;
  skin: string;
  outfit: string;
  trim: string;
  bow: string;
};

type CharacterAsset =
  | {
      id: number;
      gender: Gender;
      source: "png";
      src: string;
    }
  | {
      id: number;
      gender: Gender;
      source: "preview";
      style: PreviewStyle;
    };

type SceneItem = {
  id: number;
  src: string;
  x: number;
  y: number;
  scale: number; // NEW: scale factor for resizing
};

type SceneBackground = {
  id: string;
  name: string;
  background: string;
  deco: "clouds" | "stars" | "hearts" | "waves" | "grid" | "sparkles";
  ground: string;
};

type AvailableItem = {
  filename: string;
  src: string;
};

const SOCIALS = {
  instagram: "@your_instagram_id",
  telegram: "@your_telegram_id",
};

const CHARACTER_SCAN_LIMIT = 24;
const ITEM_SCAN_LIMIT = 50; // Scan up to 50 items

const PREVIEW_STYLES: Record<Gender, PreviewStyle[]> = {
  male: [
    { hair: "#3a2a35", skin: "#f3c7b5", outfit: "#211f21", trim: "#f7e0f6", bow: "#d986d5" },
    { hair: "#5c4036", skin: "#e7b69f", outfit: "#d986d5", trim: "#211f21", bow: "#ffb7f3" },
    { hair: "#171416", skin: "#d89f7c", outfit: "#f7e0f6", trim: "#d986d5", bow: "#d986d5" },
    { hair: "#704f3a", skin: "#f0c5a7", outfit: "#6a4769", trim: "#f2f5f3", bow: "#ff89d8" },
    { hair: "#2f2a32", skin: "#c8896e", outfit: "#d986d5", trim: "#ffffff", bow: "#211f21" },
    { hair: "#8a5b3b", skin: "#f5d1bd", outfit: "#211f21", trim: "#d986d5", bow: "#d986d5" },
  ],
  female: [
    { hair: "#f0c23d", skin: "#f3c7b5", outfit: "#d986d5", trim: "#ffffff", bow: "#ff72d2" },
    { hair: "#3d2734", skin: "#df9f86", outfit: "#211f21", trim: "#d986d5", bow: "#d986d5" },
    { hair: "#b4694f", skin: "#f0c5a7", outfit: "#f7e0f6", trim: "#d986d5", bow: "#ff8ee3" },
    { hair: "#211f21", skin: "#c8896e", outfit: "#d986d5", trim: "#211f21", bow: "#f6b7ef" },
    { hair: "#8a5b3b", skin: "#f5d1bd", outfit: "#6a4769", trim: "#f2f5f3", bow: "#d986d5" },
    { hair: "#663f62", skin: "#e7b69f", outfit: "#d986d5", trim: "#ffffff", bow: "#211f21" },
  ],
};

const SCENE_BACKGROUNDS: SceneBackground[] = [
  {
    id: "candy-sky",
    name: "Candy Sky",
    background: "linear-gradient(180deg, #ffd7f4 0%, #f6b7ef 42%, #d986d5 100%)",
    deco: "clouds",
    ground: "#c86ec3",
  },
  {
    id: "neon-night",
    name: "Neon Night",
    background: "linear-gradient(180deg, #211f21 0%, #3d2743 55%, #6a3f6f 100%)",
    deco: "stars",
    ground: "#d986d5",
  },
  {
    id: "mint-meadow",
    name: "Mint Meadow",
    background: "linear-gradient(180deg, #d9f2e2 0%, #b7e6c8 55%, #8fd3a8 100%)",
    deco: "hearts",
    ground: "#5faf7c",
  },
  {
    id: "sunset-runway",
    name: "Sunset Runway",
    background: "linear-gradient(180deg, #ffcf9e 0%, #ff9db0 52%, #d986d5 100%)",
    deco: "sparkles",
    ground: "#a85aa4",
  },
  {
    id: "pixel-ocean",
    name: "Pixel Ocean",
    background: "linear-gradient(180deg, #bfe6ff 0%, #8fcaef 48%, #5f9fd3 100%)",
    deco: "waves",
    ground: "#3e6f9c",
  },
  {
    id: "studio-blush",
    name: "Studio Blush",
    background: "linear-gradient(180deg, #f7f9f7 0%, #f2e4f1 60%, #e6c4e4 100%)",
    deco: "grid",
    ground: "#d986d5",
  },
];

// Fallback items if none found in /item folder
const FALLBACK_ITEMS = [
  "1.png",
  "heart.png",
  "cloud.png",
  "bow.png",
  "cat.png",
  "paw.png",
  "moon.png",
  "flower.png",
];

/* Base pixel size of each sticker (before scaling) */
const STICKER_BASE_PX = 64;
const MIN_SCALE = 0.4;
const MAX_SCALE = 3.0;

function getPreviewAssets(gender: Gender): CharacterAsset[] {
  return PREVIEW_STYLES[gender].map((style, index) => ({
    id: index + 1,
    gender,
    source: "preview",
    style,
  }));
}

function isCharacterAsset(asset: CharacterAsset | null): asset is CharacterAsset {
  return asset !== null;
}

function loadCharacterCollection(gender: Gender) {
  const checks = Array.from({ length: CHARACTER_SCAN_LIMIT }, (_, index) => {
    const id = index + 1;
    const src = `/${gender}/${id}.jpg`;

    return new Promise<CharacterAsset | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ id, gender, source: "png", src });
      image.onerror = () => resolve(null);
      image.src = src;
    });
  });

  return Promise.all(checks).then((assets) => assets.filter(isCharacterAsset));
}

// Auto-detect items in /item folder
function loadAvailableItems(): Promise<AvailableItem[]> {
  const extensions = ["png", "jpg", "jpeg", "webp", "gif"];
  const namesToCheck: string[] = [];

  // Check numbered items: 1.png, 2.png, ... up to ITEM_SCAN_LIMIT
  for (let i = 1; i <= ITEM_SCAN_LIMIT; i++) {
    for (const ext of extensions) {
      namesToCheck.push(`${i}.${ext}`);
    }
  }

  // Check common named items
  const commonNames = [
    "heart", "cloud", "bow", "cat", "paw", "moon", "flower", "star",
    "sparkle", "diamond", "crown", "butterfly", "rainbow", "sun",
    "love", "kiss", "smile", "cake", "gift", "balloon", "candy",
    "cherry", "strawberry", "ice-cream", "donut", "pizza", "burger",
    "coffee", "tea", "music", "note", "headphone", "camera", "phone",
    "laptop", "game", "controller", "sword", "shield", "magic", "wand",
    "potion", "crystal", "gem", "ring", "necklace", "glasses", "hat",
    "cap", "shoe", "bag", "dress", "shirt", "pants", "sock"
  ];

  for (const name of commonNames) {
    for (const ext of extensions) {
      namesToCheck.push(`${name}.${ext}`);
    }
  }

  const checks = namesToCheck.map((filename) => {
    const src = `/item/${filename}`;
    return new Promise<AvailableItem | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ filename, src });
      image.onerror = () => resolve(null);
      image.src = src;
    });
  });

  return Promise.all(checks).then((results) => {
    const found = results.filter((r): r is AvailableItem => r !== null);
    
    // Remove duplicates (same file with different attempted extensions)
    const unique = new Map<string, AvailableItem>();
    for (const item of found) {
      const baseName = item.filename.replace(/\.[^.]+$/, "");
      if (!unique.has(baseName)) {
        unique.set(baseName, item);
      }
    }
    
    return Array.from(unique.values());
  });
}

export default function App() {
  const [step, setStep] = useState<Step>("landing");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterAsset | null>(null);
  const [backgroundId, setBackgroundId] = useState(SCENE_BACKGROUNDS[0].id);
  const [items, setItems] = useState<SceneItem[]>([]);
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  // Auto-detect items on mount
  useEffect(() => {
    setIsLoadingItems(true);
    loadAvailableItems().then((found) => {
      if (found.length > 0) {
        setAvailableItems(found);
      } else {
        // Use fallback items
        setAvailableItems(
          FALLBACK_ITEMS.map((filename) => ({
            filename,
            src: `/item/${filename}`,
          }))
        );
      }
      setIsLoadingItems(false);
    });
  }, []);

  const handleRestart = () => {
    setStep("landing");
    setUsername("");
    setGender(null);
    setSelectedCharacter(null);
    setBackgroundId(SCENE_BACKGROUNDS[0].id);
    setItems([]);
  };

  return (
    <AppShell>
      {step === "landing" && (
        <LandingPage onYes={() => setStep("setup")} onNo={() => setStep("declined")} />
      )}

      {step === "declined" && <DeclinedPage onBack={() => setStep("landing")} />}

      {step === "setup" && (
        <CharacterSetup
          gender={gender}
          username={username}
          onBack={() => setStep("landing")}
          onGenderChange={setGender}
          onUsernameChange={setUsername}
          onSubmit={() => {
            setSelectedCharacter(null);
            setStep("designer");
          }}
        />
      )}

      {step === "designer" && gender && (
        <AvatarDesigner
          gender={gender}
          username={username}
          selectedCharacter={selectedCharacter}
          onBack={() => setStep("setup")}
          onRestart={handleRestart}
          onSelectCharacter={setSelectedCharacter}
          onContinue={() => setStep("studio")}
        />
      )}

      {step === "studio" && gender && selectedCharacter && (
        <PhotoStudio
          username={username}
          character={selectedCharacter}
          backgroundId={backgroundId}
          items={items}
          availableItems={availableItems}
          isLoadingItems={isLoadingItems}
          onBackgroundChange={setBackgroundId}
          onItemsChange={setItems}
          onBack={() => setStep("designer")}
          onRestart={handleRestart}
        />
      )}
    </AppShell>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f2f5f3] text-[#211f21] selection:bg-[#d986d5] selection:text-white">
      <AmbientBackdrop />
      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <SocialFooter />
      </div>
    </div>
  );
}

function LandingPage({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <section className="relative flex flex-1 items-center justify-center px-6 py-20">
      <PixelCat className="cat-drift absolute bottom-8 left-1/2 h-[340px] w-[340px] -translate-x-1/2 opacity-[0.08] sm:h-[460px] sm:w-[460px]" />
      <NeonBow className="bow-float absolute left-[10%] top-[14%] h-20 w-28 rotate-[-12deg] opacity-75" />
      <NeonBow className="bow-float-delay absolute bottom-[18%] right-[9%] h-16 w-24 rotate-[14deg] opacity-80" />

      <div className="page-rise mx-auto flex max-w-4xl flex-col items-center text-center">
        <BrandLockup />
        <h1 className="mt-8 max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.06em] text-[#211f21] sm:text-7xl lg:text-8xl">
          Would you like to design your avatar?
        </h1>
        <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-[#211f21]/70 sm:text-lg">
          Walk the pixel runway, pick a character, style a scene with your interests, and shoot the final photo.
        </p>
        <div className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="primary" onClick={onYes} className="sm:min-w-36">
            Yes
          </Button>
          <Button variant="secondary" onClick={onNo} className="sm:min-w-36">
            No
          </Button>
        </div>
      </div>
    </section>
  );
}

function DeclinedPage({ onBack }: { onBack: () => void }) {
  return (
    <section className="page-rise flex flex-1 items-center justify-center px-6 py-20">
      <div className="relative max-w-2xl text-center">
        <PixelCat className="cat-bob mx-auto mb-8 h-28 w-28" accent="#d986d5" />
        <h1 className="text-4xl font-black tracking-[-0.04em] text-[#211f21] sm:text-6xl">No problem.</h1>
        <p className="mx-auto mt-5 max-w-xl text-base font-medium leading-7 text-[#211f21]/70 sm:text-lg">
          The avatar studio will stay ready for you whenever you want to create a character.
        </p>
        <Button variant="primary" onClick={onBack} className="mt-9">
          Back to start
        </Button>
      </div>
    </section>
  );
}

function CharacterSetup({
  gender,
  username,
  onBack,
  onGenderChange,
  onUsernameChange,
  onSubmit,
}: {
  gender: Gender | null;
  username: string;
  onBack: () => void;
  onGenderChange: (gender: Gender) => void;
  onUsernameChange: (username: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = username.trim().length > 0 && gender !== null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (canSubmit) {
      onSubmit();
    }
  };

  return (
    <section className="flex flex-1 items-center px-6 py-12 sm:py-16">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1fr]">
        <div className="page-rise relative text-center lg:text-left">
          <BackPill onClick={onBack}>Back</BackPill>
          <BrandLockup align="left" />
          <h1 className="mt-7 text-4xl font-black leading-[0.98] tracking-[-0.05em] text-[#211f21] sm:text-6xl">
            Set up your character.
          </h1>
          <p className="mt-5 max-w-lg text-base font-medium leading-7 text-[#211f21]/70 max-lg:mx-auto sm:text-lg">
            Choose a username and gender so the studio can show the matching PNG collection.
          </p>
          <div className="relative mx-auto mt-10 h-40 w-40 lg:mx-0">
            <PixelCat className="cat-bob h-full w-full" />
            <NeonBow className="bow-float absolute -right-6 top-4 h-16 w-20 rotate-12" />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="page-rise-delay rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_30px_90px_rgba(217,134,213,0.22)] backdrop-blur-md sm:p-8"
        >
          <div className="rounded-[1.5rem] border border-[#d986d5]/20 bg-[#f2f5f3]/70 p-5 sm:p-7">
            <label htmlFor="username" className="block text-sm font-black uppercase tracking-[0.22em] text-[#211f21]/60">
              Character Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => onUsernameChange(event.target.value)}
              placeholder="PixelKitty"
              className="mt-4 w-full rounded-3xl border border-[#211f21]/10 bg-white px-5 py-4 text-lg font-extrabold text-[#211f21] shadow-inner shadow-[#211f21]/5 outline-none transition placeholder:text-[#211f21]/30 focus:border-[#d986d5] focus:ring-4 focus:ring-[#d986d5]/20"
            />
          </div>

          <fieldset className="mt-6 rounded-[1.5rem] border border-[#d986d5]/20 bg-[#f2f5f3]/70 p-5 sm:p-7">
            <legend className="text-sm font-black uppercase tracking-[0.22em] text-[#211f21]/60">Gender Selection</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <GenderOption gender="male" activeGender={gender} onChange={onGenderChange} />
              <GenderOption gender="female" activeGender={gender} onChange={onGenderChange} />
            </div>
          </fieldset>

          <Button variant="primary" type="submit" disabled={!canSubmit} className="mt-7 w-full">
            Start Designing
          </Button>
        </form>
      </div>
    </section>
  );
}

function GenderOption({
  gender,
  activeGender,
  onChange,
}: {
  gender: Gender;
  activeGender: Gender | null;
  onChange: (gender: Gender) => void;
}) {
  const isActive = activeGender === gender;
  const label = gender === "male" ? "Male" : "Female";

  return (
    <button
      type="button"
      onClick={() => onChange(gender)}
      aria-pressed={isActive}
      className={cn(
        "group relative overflow-hidden rounded-3xl border px-5 py-5 text-left shadow-[0_18px_45px_rgba(33,31,33,0.08)] transition duration-300 focus:outline-none focus:ring-4 focus:ring-[#d986d5]/25",
        isActive
          ? "border-[#d986d5] bg-[#d986d5] text-white shadow-[0_22px_55px_rgba(217,134,213,0.38)]"
          : "border-white bg-white text-[#211f21] hover:-translate-y-1 hover:border-[#d986d5]/50"
      )}
    >
      <span className="relative z-10 block text-lg font-black">{label}</span>
      <span
        className={cn(
          "relative z-10 mt-1 block text-sm font-semibold",
          isActive ? "text-white/80" : "text-[#211f21]/50"
        )}
      >
        Show {label.toLowerCase()} avatars only
      </span>
      <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20 transition group-hover:scale-125" />
    </button>
  );
}

function AvatarDesigner({
  gender,
  username,
  selectedCharacter,
  onBack,
  onRestart,
  onSelectCharacter,
  onContinue,
}: {
  gender: Gender;
  username: string;
  selectedCharacter: CharacterAsset | null;
  onBack: () => void;
  onRestart: () => void;
  onSelectCharacter: (asset: CharacterAsset) => void;
  onContinue: () => void;
}) {
  const [uploadedAssets, setUploadedAssets] = useState<CharacterAsset[] | null>(null);
  const displayName = username.trim() || "PixelKitty";
  const previewAssets = useMemo(() => getPreviewAssets(gender), [gender]);
  const assets = useMemo(
    () => (uploadedAssets && uploadedAssets.length > 0 ? uploadedAssets : previewAssets),
    [previewAssets, uploadedAssets]
  );
  const isScanning = uploadedAssets === null;
  const isUsingPreview = uploadedAssets !== null && uploadedAssets.length === 0;

  const activeIndex = useMemo(() => {
    if (!selectedCharacter) {
      return 0;
    }

    const index = assets.findIndex(
      (asset) =>
        asset.id === selectedCharacter.id && asset.source === selectedCharacter.source && asset.gender === selectedCharacter.gender
    );

    return index >= 0 ? index : 0;
  }, [assets, selectedCharacter]);

  useEffect(() => {
    let isActive = true;
    setUploadedAssets(null);

    loadCharacterCollection(gender).then((collection) => {
      if (isActive) {
        setUploadedAssets(collection);
      }
    });

    return () => {
      isActive = false;
    };
  }, [gender]);

  useEffect(() => {
    if (assets.length === 0) {
      return;
    }

    const selectionStillVisible = selectedCharacter
      ? assets.some((asset) => asset.id === selectedCharacter.id && asset.source === selectedCharacter.source)
      : false;

    if (!selectionStillVisible) {
      onSelectCharacter(assets[0]);
    }
  }, [assets, onSelectCharacter, selectedCharacter]);

  const goTo = useCallback(
    (index: number) => {
      if (assets.length === 0) {
        return;
      }

      const nextIndex = (index + assets.length) % assets.length;
      onSelectCharacter(assets[nextIndex]);
    },
    [assets, onSelectCharacter]
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        goTo(activeIndex - 1);
      }

      if (event.key === "ArrowRight") {
        goTo(activeIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, goTo]);

  const genderLabel = gender === "male" ? "Male" : "Female";
  const activeCharacter = assets[activeIndex];

  return (
    <section className="flex flex-1 px-6 py-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col">
        <header className="page-rise flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandLockup />
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={onBack}>
              Edit setup
            </Button>
            <Button variant="secondary" onClick={onRestart}>
              Restart
            </Button>
          </div>
        </header>

        <div className="page-rise mt-10 text-center">
          <p className="text-sm font-black uppercase tracking-[0.26em] text-[#d986d5]">{genderLabel} collection runway</p>
          <h1 className="mt-3 text-4xl font-black leading-none tracking-[-0.05em] text-[#211f21] sm:text-6xl">
            Select your avatar, {displayName}.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-[#211f21]/70 sm:text-lg">
            Scroll or use the arrows to move the runway. The character in the spotlight is your current pick.
          </p>
          <p className="mt-2 text-sm font-semibold text-[#211f21]/60">
            {isScanning && "Scanning your PNG folder..."}
            {isUsingPreview && "No PNG files found in male/1.png... or female/1.png..., showing preview avatars."}
            {!isScanning && !isUsingPreview && `${assets.length} PNG avatar${assets.length === 1 ? "" : "s"} loaded from /${gender}.`}
          </p>
        </div>

        <RunwayCarousel assets={assets} activeIndex={activeIndex} onNavigate={goTo} />

        <div className="page-rise-delay mx-auto mt-8 flex w-full max-w-xl flex-col items-center gap-4">
          <div className="flex w-full items-center justify-between rounded-full border border-white bg-white/75 px-6 py-3 text-sm font-black text-[#211f21] shadow-[0_18px_45px_rgba(33,31,33,0.1)] backdrop-blur">
            <span>In the spotlight</span>
            <span className="text-[#d986d5]">
              Avatar #{activeCharacter?.id ?? 1} of {assets.length}
            </span>
          </div>
          <Button variant="primary" className="w-full" onClick={onContinue}>
            Continue to Photo Studio
          </Button>
        </div>
      </div>
    </section>
  );
}

function RunwayCarousel({
  assets,
  activeIndex,
  onNavigate,
}: {
  assets: CharacterAsset[];
  activeIndex: number;
  onNavigate: (index: number) => void;
}) {
  const wheelLockRef = useRef(0);
  const dragStartRef = useRef<number | null>(null);
  const ITEM_WIDTH = 220;

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const now = Date.now();

    if (now - wheelLockRef.current < 260) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

    if (Math.abs(delta) < 8) {
      return;
    }

    wheelLockRef.current = now;
    onNavigate(activeIndex + (delta > 0 ? 1 : -1));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStartRef.current = event.clientX;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current === null) {
      return;
    }

    const delta = event.clientX - dragStartRef.current;
    dragStartRef.current = null;

    if (Math.abs(delta) > 40) {
      onNavigate(activeIndex + (delta < 0 ? 1 : -1));
    }
  };

  return (
    <div className="page-rise-delay relative mt-8">
      <NeonBow className="bow-float absolute -top-2 left-[8%] z-20 hidden h-14 w-20 rotate-[-10deg] md:block" />
      <NeonBow className="bow-float-delay absolute -top-4 right-[9%] z-20 hidden h-12 w-16 rotate-[12deg] md:block" />

      <button
        type="button"
        onClick={() => onNavigate(activeIndex - 1)}
        aria-label="Previous character"
        className="absolute left-2 top-1/2 z-30 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-white/85 text-[#211f21] shadow-[0_18px_45px_rgba(33,31,33,0.18)] backdrop-blur transition hover:-translate-y-[calc(50%+4px)] hover:bg-[#d986d5] hover:text-white focus:outline-none focus:ring-4 focus:ring-[#d986d5]/30 sm:left-6"
      >
        <ArrowIcon direction="left" />
      </button>
      <button
        type="button"
        onClick={() => onNavigate(activeIndex + 1)}
        aria-label="Next character"
        className="absolute right-2 top-1/2 z-30 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-white/85 text-[#211f21] shadow-[0_18px_45px_rgba(33,31,33,0.18)] backdrop-blur transition hover:-translate-y-[calc(50%+4px)] hover:bg-[#d986d5] hover:text-white focus:outline-none focus:ring-4 focus:ring-[#d986d5]/30 sm:right-6"
      >
        <ArrowIcon direction="right" />
      </button>

      <div
        className="relative touch-pan-y select-none overflow-hidden rounded-[2.5rem] border border-white/80 bg-white/55 py-10 shadow-[0_30px_90px_rgba(217,134,213,0.2)] backdrop-blur-md"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          dragStartRef.current = null;
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-8 mx-auto h-6 w-[64%] rounded-full bg-[#d986d5]/25 blur-md" />
        <div className="pointer-events-none absolute inset-x-[12%] bottom-10 h-3 rounded-full bg-[#211f21]/8" />

        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(calc(50% - ${(activeIndex + 0.5) * ITEM_WIDTH}px))` }}
        >
          {assets.map((asset, index) => {
            const isActive = index === activeIndex;
            const distance = Math.abs(index - activeIndex);

            return (
              <button
                key={`${asset.source}-${asset.gender}-${asset.id}`}
                type="button"
                onClick={() => onNavigate(index)}
                aria-label={`Select ${asset.gender} avatar ${asset.id}`}
                className="shrink-0 focus:outline-none"
                style={{ width: ITEM_WIDTH }}
              >
                <div
                  className={cn(
                    "mx-auto flex flex-col items-center transition-all duration-500",
                    isActive ? "scale-100 opacity-100" : distance === 1 ? "scale-[0.68] opacity-45" : "scale-[0.55] opacity-20"
                  )}
                >
                  <div
                    className={cn(
                      "relative h-48 w-48 rounded-[1.8rem] border p-4 transition-all duration-500 sm:h-56 sm:w-56",
                      isActive
                        ? "spotlight-glow border-[#d986d5] bg-white shadow-[0_28px_70px_rgba(217,134,213,0.4)]"
                        : "border-white bg-white/80 shadow-[0_18px_45px_rgba(33,31,33,0.1)]"
                    )}
                  >
                    {isActive && <NeonBow className="absolute -top-4 left-1/2 z-10 h-10 w-14 -translate-x-1/2" />}
                    <CharacterVisual asset={asset} large={isActive} />
                  </div>
                  <span
                    className={cn(
                      "mt-4 rounded-full px-4 py-1.5 text-sm font-black transition",
                      isActive ? "bg-[#211f21] text-white" : "bg-white/70 text-[#211f21]/60"
                    )}
                  >
                    Avatar {asset.id}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex justify-center gap-2">
        {assets.map((asset, index) => (
          <button
            key={`dot-${asset.source}-${asset.id}`}
            type="button"
            onClick={() => onNavigate(index)}
            aria-label={`Go to avatar ${asset.id}`}
            className={cn(
              "h-2.5 rounded-full transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-[#d986d5]/25",
              index === activeIndex ? "w-8 bg-[#d986d5]" : "w-2.5 bg-[#211f21]/15 hover:bg-[#d986d5]/50"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function PhotoStudio({
  username,
  character,
  backgroundId,
  items,
  availableItems,
  isLoadingItems,
  onBackgroundChange,
  onItemsChange,
  onBack,
  onRestart,
}: {
  username: string;
  character: CharacterAsset;
  backgroundId: string;
  items: SceneItem[];
  availableItems: AvailableItem[];
  isLoadingItems: boolean;
  onBackgroundChange: (id: string) => void;
  onItemsChange: (items: SceneItem[]) => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const [isShooting, setIsShooting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ id: number; startScale: number; startDistance: number } | null>(null);
  const nextIdRef = useRef(1);
  const displayName = username.trim() || "PixelKitty";
  const background = SCENE_BACKGROUNDS.find((b) => b.id === backgroundId) ?? SCENE_BACKGROUNDS[0];

  const ITEMS_PER_PAGE = 8;
  const hasMoreItems = availableItems.length > ITEMS_PER_PAGE;
  const displayedItems = showAllItems ? availableItems : availableItems.slice(0, ITEMS_PER_PAGE);

  const addItem = (item: AvailableItem) => {
    const newItem: SceneItem = {
      id: nextIdRef.current++,
      src: item.src,
      x: 10 + ((items.length * 7) % 60),
      y: 10 + ((items.length * 12) % 50),
      scale: 1,
    };
    onItemsChange([...items, newItem]);
  };

  const removeItem = (id: number) => {
    onItemsChange(items.filter((item) => item.id !== id));
    if (selectedItemId === id) {
      setSelectedItemId(null);
    }
  };

  const updateItemScale = (id: number, newScale: number) => {
    const clampedScale = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
    onItemsChange(
      items.map((item) => (item.id === id ? { ...item, scale: clampedScale } : item))
    );
  };

  /* ── Drag handling at the SCENE level ── */
  const handleScenePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    
    // Check if clicking on resize handle
    const resizeHandle = target.closest<HTMLElement>("[data-resize-handle]");
    if (resizeHandle) {
      const stickerId = Number(resizeHandle.dataset.resizeHandle);
      const item = items.find((i) => i.id === stickerId);
      if (item) {
        resizeRef.current = {
          id: stickerId,
          startScale: item.scale,
          startDistance: 0,
        };
        const scene = sceneRef.current;
        if (scene) {
          scene.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    // Check if clicking on a sticker
    const stickerEl = target.closest<HTMLElement>("[data-sticker-id]");
    if (stickerEl) {
      const stickerId = Number(stickerEl.dataset.stickerId);
      if (!isNaN(stickerId)) {
        setSelectedItemId(stickerId);
        
        const scene = sceneRef.current;
        if (!scene) return;

        const stickerRect = stickerEl.getBoundingClientRect();
        dragRef.current = {
          id: stickerId,
          offsetX: event.clientX - stickerRect.left,
          offsetY: event.clientY - stickerRect.top,
        };

        scene.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }

    // Clicked on empty space - deselect
    setSelectedItemId(null);
  };

  const handleScenePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Handle resize
    if (resizeRef.current) {
      const sceneRect = scene.getBoundingClientRect();
      const item = items.find((i) => i.id === resizeRef.current!.id);
      if (!item) return;

      // Calculate distance from item center to pointer
      const itemCenterX = sceneRect.left + (item.x / 100) * sceneRect.width + (STICKER_BASE_PX * item.scale) / 2;
      const itemCenterY = sceneRect.top + (item.y / 100) * sceneRect.height + (STICKER_BASE_PX * item.scale) / 2;
      const distance = Math.sqrt(
        Math.pow(event.clientX - itemCenterX, 2) + Math.pow(event.clientY - itemCenterY, 2)
      );

      if (resizeRef.current.startDistance === 0) {
        resizeRef.current.startDistance = distance;
      } else {
        const scaleFactor = distance / resizeRef.current.startDistance;
        const newScale = resizeRef.current.startScale * scaleFactor;
        updateItemScale(resizeRef.current.id, newScale);
      }
      return;
    }

    // Handle drag
    const drag = dragRef.current;
    if (!drag) return;

    const sceneRect = scene.getBoundingClientRect();
    const item = items.find((i) => i.id === drag.id);
    if (!item) return;

    const stickerSize = STICKER_BASE_PX * item.scale;
    const stickerWidthPct = (stickerSize / sceneRect.width) * 100;
    const stickerHeightPct = (stickerSize / sceneRect.height) * 100;

    const rawX = ((event.clientX - drag.offsetX - sceneRect.left) / sceneRect.width) * 100;
    const rawY = ((event.clientY - drag.offsetY - sceneRect.top) / sceneRect.height) * 100;

    const x = Math.min(Math.max(rawX, 0), 100 - stickerWidthPct);
    const y = Math.min(Math.max(rawY, 0), 100 - stickerHeightPct);

    onItemsChange(
      items.map((i) => (i.id === drag.id ? { ...i, x, y } : i))
    );
  };

  const handleScenePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    resizeRef.current = null;
    const scene = sceneRef.current;
    if (scene) {
      scene.releasePointerCapture(event.pointerId);
    }
  };

  // Handle scroll wheel for resizing selected item
  const handleSceneWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (selectedItemId === null) return;
    
    event.preventDefault();
    const item = items.find((i) => i.id === selectedItemId);
    if (!item) return;

    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    updateItemScale(selectedItemId, item.scale + delta);
  };

  const takeShot = async () => {
    const scene = sceneRef.current;
    if (!scene || isShooting) return;

    // Deselect before shooting
    setSelectedItemId(null);

    setIsShooting(true);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 420);

    try {
      // Wait a frame for deselection to render
      await new Promise((r) => setTimeout(r, 50));
      
      const dataUrl = await toPng(scene, {
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
      });
      const link = document.createElement("a");
      link.download = `meow-cat-${displayName.toLowerCase().replace(/\s+/g, "-")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Could not capture the scene", error);
    } finally {
      setIsShooting(false);
    }
  };

  return (
    <section className="flex flex-1 px-6 py-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col">
        <header className="page-rise flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandLockup />
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={onBack}>
              Change avatar
            </Button>
            <Button variant="secondary" onClick={onRestart}>
              Restart
            </Button>
          </div>
        </header>

        <div className="page-rise mt-10 max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.26em] text-[#d986d5]">Photo studio</p>
          <h1 className="mt-3 text-4xl font-black leading-none tracking-[-0.05em] text-[#211f21] sm:text-6xl">
            Style your scene, {displayName}.
          </h1>
          <p className="mt-5 text-base font-medium leading-7 text-[#211f21]/70 sm:text-lg">
            Pick a backdrop, add stickers, drag them anywhere, scroll to resize selected sticker, then hit Shot.
          </p>
        </div>

        <div className="mt-9 grid flex-1 gap-8 lg:grid-cols-[1fr_400px]">
          <div className="page-rise-delay min-w-0">
            <div
              ref={sceneRef}
              className="relative mx-auto aspect-[4/5] w-full max-w-xl overflow-hidden rounded-[2rem] border-4 border-white shadow-[0_35px_100px_rgba(33,31,33,0.22)] touch-none"
              style={{ background: background.background }}
              onPointerDown={handleScenePointerDown}
              onPointerMove={handleScenePointerMove}
              onPointerUp={handleScenePointerUp}
              onPointerCancel={handleScenePointerUp}
              onWheel={handleSceneWheel}
            >
              <SceneDeco variant={background.deco} />

              <div
                className="absolute inset-x-0 bottom-0 h-[16%]"
                style={{ background: `linear-gradient(180deg, transparent 0%, ${background.ground}55 45%, ${background.ground}99 100%)` }}
              />
              <div className="absolute bottom-[4%] left-1/2 h-4 w-[58%] -translate-x-1/2 rounded-full bg-[#211f21]/20 blur-sm" />

              <div className="absolute bottom-[6%] left-1/2 h-[62%] w-[62%] -translate-x-1/2">
                <CharacterVisual asset={character} large />
              </div>

              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-[#211f21]/70 px-3 py-1.5 backdrop-blur-sm">
                <PixelCat className="h-5 w-5" body="#f2f5f3" face="#211f21" accent="#d986d5" />
                <span className="text-xs font-black uppercase tracking-[0.18em] text-white">{displayName}</span>
              </div>
              <NeonBow className="absolute right-4 top-4 h-8 w-12 rotate-6" />

              {items.map((item) => {
                const isSelected = selectedItemId === item.id;
                const size = STICKER_BASE_PX * item.scale;
                
                return (
                  <div
                    key={item.id}
                    data-sticker-id={item.id}
                    className={cn(
                      "absolute z-20 cursor-grab select-none active:cursor-grabbing",
                      isSelected && "ring-2 ring-[#d986d5] ring-offset-2 rounded-lg"
                    )}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: size,
                      height: size,
                    }}
                  >
                    <img
                      src={item.src}
                      alt="sticker"
                      draggable={false}
                      className="pointer-events-none h-full w-full object-contain drop-shadow-md"
                    />
                    {/* Resize handle */}
                    {isSelected && (
                      <div
                        data-resize-handle={item.id}
                        className="absolute -bottom-2 -right-2 h-5 w-5 cursor-se-resize rounded-full bg-[#d986d5] border-2 border-white shadow-md flex items-center justify-center"
                      >
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M21 21L12 12M21 21V15M21 21H15" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}

              <div
                className={cn(
                  "pointer-events-none absolute inset-0 z-30 bg-white transition-opacity duration-300",
                  flash ? "opacity-90" : "opacity-0"
                )}
              />
            </div>

            <p className="mt-4 text-center text-sm font-semibold text-[#211f21]/60">
              Click a sticker to select it. Drag to move, scroll to resize, or drag the corner handle.
            </p>
          </div>

          <aside className="page-rise-delay flex h-fit flex-col gap-6 rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_30px_90px_rgba(33,31,33,0.12)] backdrop-blur-md sm:p-6 lg:sticky lg:top-8">
            <div className="rounded-[1.5rem] border border-[#d986d5]/20 bg-[#f2f5f3]/70 p-5">
              <h2 className="text-sm font-black uppercase tracking-[0.22em] text-[#211f21]/60">Background</h2>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {SCENE_BACKGROUNDS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onBackgroundChange(item.id)}
                    aria-pressed={item.id === background.id}
                    className={cn(
                      "group flex flex-col items-center gap-2 rounded-2xl border p-2 transition duration-300 focus:outline-none focus:ring-4 focus:ring-[#d986d5]/25",
                      item.id === background.id
                        ? "border-[#d986d5] bg-white shadow-[0_16px_40px_rgba(217,134,213,0.3)]"
                        : "border-transparent bg-white/60 hover:-translate-y-0.5 hover:border-[#d986d5]/40"
                    )}
                  >
                    <span className="h-12 w-full rounded-xl border border-white shadow-inner" style={{ background: item.background }} />
                    <span className="text-[11px] font-black leading-tight text-[#211f21]/70">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[#d986d5]/20 bg-[#f2f5f3]/70 p-5">
              <h2 className="text-sm font-black uppercase tracking-[0.22em] text-[#211f21]/60">
                Additional Items
              </h2>
              <p className="mt-1 text-xs font-semibold text-[#211f21]/50">
                {isLoadingItems
                  ? "Scanning /item folder..."
                  : `${availableItems.length} item${availableItems.length === 1 ? "" : "s"} found. Click to add.`}
              </p>
              
              <div className="mt-4 grid grid-cols-4 gap-2">
                {displayedItems.map((item) => (
                  <button
                    key={item.filename}
                    type="button"
                    onClick={() => addItem(item)}
                    className="flex aspect-square items-center justify-center rounded-xl border border-[#d986d5]/20 bg-white p-1 transition hover:border-[#d986d5] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#d986d5]/25"
                  >
                    <img
                      src={item.src}
                      alt={item.filename}
                      className="h-full w-full object-contain"
                    />
                  </button>
                ))}
              </div>

              {hasMoreItems && (
                <button
                  type="button"
                  onClick={() => setShowAllItems(!showAllItems)}
                  className="mt-3 w-full rounded-xl border border-[#d986d5]/30 bg-white/80 px-4 py-2.5 text-sm font-bold text-[#d986d5] transition hover:bg-[#d986d5] hover:text-white focus:outline-none focus:ring-4 focus:ring-[#d986d5]/25"
                >
                  {showAllItems
                    ? `Show Less`
                    : `Show More (+${availableItems.length - ITEMS_PER_PAGE} items)`}
                </button>
              )}

              {items.length > 0 && (
                <div className="mt-4 border-t border-[#d986d5]/20 pt-4">
                  <p className="text-xs font-bold text-[#211f21]/50 mb-2">Scene items ({items.length}):</p>
                  <ul className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className={cn(
                            "group flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs font-black text-[#211f21] transition hover:border-[#d986d5] hover:bg-[#d986d5] hover:text-white focus:outline-none focus:ring-4 focus:ring-[#d986d5]/25",
                            selectedItemId === item.id
                              ? "border-[#d986d5] bg-[#d986d5]/10"
                              : "border-[#d986d5]/40"
                          )}
                          aria-label={`Remove sticker`}
                        >
                          <img
                            src={item.src}
                            alt=""
                            className="h-4 w-4 object-contain"
                          />
                          <span className="text-[10px] text-[#211f21]/50 group-hover:text-white/70">
                            {Math.round(item.scale * 100)}%
                          </span>
                          <span className="text-[#d986d5] group-hover:text-white">×</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Scale controls for selected item */}
            {selectedItemId !== null && (
              <div className="rounded-[1.5rem] border border-[#d986d5]/20 bg-[#f2f5f3]/70 p-5">
                <h2 className="text-sm font-black uppercase tracking-[0.22em] text-[#211f21]/60">
                  Resize Selected
                </h2>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const item = items.find((i) => i.id === selectedItemId);
                      if (item) updateItemScale(selectedItemId, item.scale - 0.2);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d986d5]/30 bg-white text-lg font-bold text-[#d986d5] transition hover:bg-[#d986d5] hover:text-white"
                  >
                    −
                  </button>
                  <div className="flex-1 text-center">
                    <span className="text-lg font-black text-[#211f21]">
                      {Math.round((items.find((i) => i.id === selectedItemId)?.scale ?? 1) * 100)}%
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const item = items.find((i) => i.id === selectedItemId);
                      if (item) updateItemScale(selectedItemId, item.scale + 0.2);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d986d5]/30 bg-white text-lg font-bold text-[#d986d5] transition hover:bg-[#d986d5] hover:text-white"
                  >
                    +
                  </button>
                </div>
                <input
                  type="range"
                  min={MIN_SCALE * 100}
                  max={MAX_SCALE * 100}
                  value={(items.find((i) => i.id === selectedItemId)?.scale ?? 1) * 100}
                  onChange={(e) => updateItemScale(selectedItemId, Number(e.target.value) / 100)}
                  className="mt-3 w-full accent-[#d986d5]"
                />
              </div>
            )}

            <Button variant="primary" className="w-full" onClick={takeShot} disabled={isShooting}>
              {isShooting ? "Developing..." : "Shot"}
            </Button>
            <p className="-mt-3 text-center text-xs font-semibold text-[#211f21]/50">
              Saves the framed scene as a PNG photo.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}

function SceneDeco({ variant }: { variant: SceneBackground["deco"] }) {
  return (
    <svg viewBox="0 0 200 250" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" shapeRendering="crispEdges">
      {variant === "clouds" && (
        <>
          <rect x="18" y="26" width="36" height="10" fill="#ffffff" opacity="0.85" />
          <rect x="26" y="18" width="20" height="8" fill="#ffffff" opacity="0.85" />
          <rect x="128" y="48" width="44" height="10" fill="#ffffff" opacity="0.75" />
          <rect x="138" y="40" width="24" height="8" fill="#ffffff" opacity="0.75" />
          <rect x="66" y="76" width="28" height="8" fill="#ffffff" opacity="0.55" />
        </>
      )}
      {variant === "stars" && (
        <>
          <rect x="24" y="26" width="6" height="6" fill="#ffffff" opacity="0.9" />
          <rect x="70" y="14" width="4" height="4" fill="#f6b7ef" opacity="0.9" />
          <rect x="122" y="30" width="6" height="6" fill="#ffffff" opacity="0.8" />
          <rect x="164" y="18" width="4" height="4" fill="#d986d5" />
          <rect x="44" y="66" width="4" height="4" fill="#ffffff" opacity="0.7" />
          <rect x="150" y="70" width="6" height="6" fill="#f6b7ef" opacity="0.8" />
          <rect x="96" y="46" width="4" height="4" fill="#ffffff" opacity="0.6" />
          <rect x="180" y="52" width="4" height="4" fill="#ffffff" opacity="0.7" />
          <rect x="140" y="16" width="16" height="16" fill="#f2f5f3" opacity="0.9" />
          <rect x="136" y="20" width="8" height="8" fill="#3d2743" />
        </>
      )}
      {variant === "hearts" && (
        <>
          <g opacity="0.8">
            <rect x="30" y="30" width="6" height="6" fill="#d986d5" />
            <rect x="42" y="30" width="6" height="6" fill="#d986d5" />
            <rect x="30" y="36" width="18" height="6" fill="#d986d5" />
            <rect x="36" y="42" width="6" height="6" fill="#d986d5" />
          </g>
          <g opacity="0.6">
            <rect x="140" y="52" width="5" height="5" fill="#ff8ee3" />
            <rect x="150" y="52" width="5" height="5" fill="#ff8ee3" />
            <rect x="140" y="57" width="15" height="5" fill="#ff8ee3" />
            <rect x="145" y="62" width="5" height="5" fill="#ff8ee3" />
          </g>
          <rect x="90" y="20" width="5" height="5" fill="#ffffff" opacity="0.8" />
          <rect x="170" y="26" width="4" height="4" fill="#ffffff" opacity="0.7" />
        </>
      )}
      {variant === "waves" && (
        <>
          <rect x="10" y="200" width="20" height="5" fill="#ffffff" opacity="0.5" />
          <rect x="50" y="192" width="26" height="5" fill="#ffffff" opacity="0.4" />
          <rect x="120" y="198" width="24" height="5" fill="#ffffff" opacity="0.5" />
          <rect x="160" y="188" width="20" height="5" fill="#ffffff" opacity="0.4" />
          <rect x="24" y="30" width="34" height="9" fill="#ffffff" opacity="0.8" />
          <rect x="32" y="23" width="18" height="7" fill="#ffffff" opacity="0.8" />
          <rect x="138" y="44" width="14" height="14" fill="#ffe9a8" opacity="0.95" />
        </>
      )}
      {variant === "grid" && (
        <>
          <rect x="0" y="60" width="200" height="1.4" fill="#d986d5" opacity="0.25" />
          <rect x="0" y="120" width="200" height="1.4" fill="#d986d5" opacity="0.25" />
          <rect x="0" y="180" width="200" height="1.4" fill="#d986d5" opacity="0.25" />
          <rect x="50" y="0" width="1.4" height="250" fill="#d986d5" opacity="0.2" />
          <rect x="100" y="0" width="1.4" height="250" fill="#d986d5" opacity="0.2" />
          <rect x="150" y="0" width="1.4" height="250" fill="#d986d5" opacity="0.2" />
        </>
      )}
      {variant === "sparkles" && (
        <>
          <rect x="28" y="34" width="6" height="6" fill="#ffffff" opacity="0.9" />
          <rect x="22" y="40" width="18" height="6" fill="#ffffff" opacity="0.5" />
          <rect x="150" y="24" width="6" height="6" fill="#ffffff" opacity="0.9" />
          <rect x="144" y="30" width="18" height="6" fill="#ffffff" opacity="0.5" />
          <rect x="94" y="60" width="5" height="5" fill="#ffffff" opacity="0.7" />
          <rect x="170" y="70" width="4" height="4" fill="#ffffff" opacity="0.7" />
          <rect x="40" y="80" width="4" height="4" fill="#ffffff" opacity="0.6" />
          <rect x="130" y="10" width="20" height="20" fill="#ffe9a8" opacity="0.9" />
        </>
      )}
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-6 w-6", direction === "left" && "rotate-180")}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function CharacterVisual({ asset, large = false }: { asset: CharacterAsset; large?: boolean }) {
  if (asset.source === "png") {
    return (
      <img
        src={asset.src}
        alt={`${asset.gender} avatar ${asset.id}`}
        draggable={false}
        className={cn("h-full w-full object-contain drop-shadow-[0_18px_28px_rgba(33,31,33,0.16)]", large && "scale-105")}
      />
    );
  }

  return <PreviewAvatar style={asset.style} gender={asset.gender} large={large} />;
}

function PreviewAvatar({ style, gender, large }: { style: PreviewStyle; gender: Gender; large?: boolean }) {
  const bowY = gender === "female" ? 26 : 40;
  const hairLength = gender === "female" ? 98 : 72;

  return (
    <svg
      viewBox="0 0 240 240"
      className={cn("h-full w-full", large && "avatar-sway")}
      role="img"
      aria-label={`${gender} preview avatar`}
      shapeRendering="crispEdges"
    >
      <rect x="32" y="184" width="176" height="28" fill="#d986d5" opacity="0.18" />
      <rect x="64" y="132" width="112" height="68" fill={style.outfit} />
      <rect x="80" y="132" width="80" height="18" fill={style.trim} opacity="0.85" />
      <rect x="54" y="78" width="132" height={hairLength} fill={style.hair} />
      <rect x="70" y="58" width="100" height="102" fill={style.hair} />
      <rect x="82" y="80" width="76" height="76" fill={style.skin} />
      <rect x="70" y="94" width="12" height="38" fill={style.skin} />
      <rect x="158" y="94" width="12" height="38" fill={style.skin} />
      <rect x="90" y="104" width="12" height="12" fill="#211f21" />
      <rect x="138" y="104" width="12" height="12" fill="#211f21" />
      <rect x="112" y="122" width="16" height="8" fill="#d986d5" />
      <rect x="104" y="140" width="32" height="8" fill="#211f21" opacity="0.7" />
      <rect x="70" y="58" width="100" height="20" fill={style.hair} />
      <rect x="58" y="70" width="28" height="24" fill={style.hair} />
      <rect x="154" y="70" width="28" height="24" fill={style.hair} />
      <rect x="82" y={bowY} width="28" height="24" fill={style.bow} />
      <rect x="130" y={bowY} width="28" height="24" fill={style.bow} />
      <rect x="110" y={bowY + 6} width="20" height="14" fill="#211f21" />
      <rect x="90" y={bowY + 8} width="12" height="8" fill="#ffffff" opacity="0.35" />
      <rect x="138" y={bowY + 8} width="12" height="8" fill="#ffffff" opacity="0.35" />
    </svg>
  );
}

function Button({
  children,
  className,
  disabled,
  onClick,
  type = "button",
  variant,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  variant: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full px-7 py-4 text-base font-black shadow-[0_18px_45px_rgba(33,31,33,0.12)] transition duration-300 focus:outline-none focus:ring-4 focus:ring-[#d986d5]/25 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-[#d986d5] text-white shadow-[0_20px_55px_rgba(217,134,213,0.42)] hover:-translate-y-1 hover:bg-[#cf6eca]",
        variant === "secondary" && "border border-[#211f21]/10 bg-white text-[#211f21] hover:-translate-y-1 hover:border-[#d986d5]/50 hover:text-[#d986d5]",
        variant === "ghost" && "border border-[#211f21]/10 bg-[#f2f5f3]/70 text-[#211f21] shadow-none hover:-translate-y-1 hover:border-[#d986d5]/50 hover:text-[#d986d5]",
        className
      )}
    >
      {children}
    </button>
  );
}

function BackPill({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-8 rounded-full border border-[#211f21]/10 bg-white/60 px-5 py-2 text-sm font-bold text-[#211f21] shadow-[0_12px_35px_rgba(33,31,33,0.08)] transition hover:-translate-y-0.5 hover:border-[#d986d5]/50 hover:text-[#d986d5] focus:outline-none focus:ring-4 focus:ring-[#d986d5]/25"
    >
      {children}
    </button>
  );
}

function BrandLockup({ align = "center" }: { align?: "center" | "left" }) {
  return (
    <div className={cn("flex items-center gap-3", align === "center" ? "justify-center" : "justify-center lg:justify-start")}>
      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#211f21] shadow-[0_18px_40px_rgba(33,31,33,0.18)]">
        <PixelCat className="h-8 w-8" body="#f2f5f3" face="#211f21" accent="#d986d5" />
      </span>
      <span className="text-left">
        <span className="block text-xs font-black uppercase tracking-[0.28em] text-[#d986d5]">Meow Cat</span>
        <span className="block text-xl font-black leading-none tracking-[-0.04em] text-[#211f21]">Avatar Studio</span>
      </span>
    </div>
  );
}

function SocialFooter() {
  return (
    <footer className="relative z-10 px-6 pb-6 pt-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 rounded-full border border-[#211f21]/10 bg-white/60 px-5 py-3 text-center text-sm font-extrabold text-[#211f21]/70 shadow-[0_18px_55px_rgba(33,31,33,0.08)] backdrop-blur sm:flex-row sm:gap-6">
        <a className="transition hover:text-[#d986d5]" href="https://instagram.com/your_instagram_id" target="_blank" rel="noreferrer">
          Instagram: {SOCIALS.instagram}
        </a>
        <span className="hidden h-4 w-px bg-[#211f21]/15 sm:block" />
        <a className="transition hover:text-[#d986d5]" href="https://t.me/your_telegram_id" target="_blank" rel="noreferrer">
          Telegram: {SOCIALS.telegram}
        </a>
      </div>
    </footer>
  );
}

function AmbientBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(217,134,213,0.26),transparent_28%),radial-gradient(circle_at_85%_10%,rgba(255,255,255,0.88),transparent_26%),linear-gradient(135deg,rgba(217,134,213,0.14),transparent_42%)]" />
      <div className="absolute left-[-10%] top-[12%] h-72 w-72 rounded-full bg-[#d986d5]/20 blur-3xl" />
      <div className="absolute bottom-[-14%] right-[-12%] h-96 w-96 rounded-full bg-white blur-3xl" />
      <PixelCat className="cat-bob absolute right-[7%] top-[22%] hidden h-24 w-24 opacity-20 md:block" />
      <PixelCat className="cat-bob-delay absolute bottom-[24%] left-[8%] hidden h-20 w-20 opacity-20 lg:block" accent="#ff9ee9" />
      <div className="pixel-grid absolute inset-0 opacity-[0.18]" />
    </div>
  );
}

function PixelCat({
  className,
  body = "#211f21",
  face = "#f2f5f3",
  accent = "#d986d5",
}: {
  className?: string;
  body?: string;
  face?: string;
  accent?: string;
}) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true" shapeRendering="crispEdges">
      <rect x="38" y="26" width="24" height="28" fill={body} />
      <rect x="98" y="26" width="24" height="28" fill={body} />
      <rect x="48" y="42" width="64" height="18" fill={body} />
      <rect x="34" y="54" width="92" height="78" fill={body} />
      <rect x="50" y="72" width="60" height="44" fill={face} />
      <rect x="58" y="82" width="10" height="10" fill={body} />
      <rect x="92" y="82" width="10" height="10" fill={body} />
      <rect x="76" y="94" width="8" height="8" fill={accent} />
      <rect x="68" y="108" width="24" height="6" fill={body} opacity="0.65" />
      <rect x="18" y="84" width="22" height="8" fill={body} />
      <rect x="120" y="84" width="22" height="8" fill={body} />
      <rect x="16" y="100" width="24" height="8" fill={body} />
      <rect x="120" y="100" width="24" height="8" fill={body} />
      <rect x="48" y="124" width="18" height="20" fill={body} />
      <rect x="94" y="124" width="18" height="20" fill={body} />
      <rect x="58" y="36" width="18" height="16" fill={accent} />
      <rect x="84" y="36" width="18" height="16" fill={accent} />
      <rect x="76" y="40" width="8" height="8" fill={body} />
    </svg>
  );
}

function NeonBow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 70" className={cn("neon-bow", className)} aria-hidden="true">
      <path d="M10 12L52 34L10 58V12Z" fill="#d986d5" />
      <path d="M110 12L68 34L110 58V12Z" fill="#d986d5" />
      <rect x="52" y="24" width="16" height="20" rx="4" fill="#211f21" />
      <path d="M20 23L42 34L20 45V23Z" fill="#ffffff" opacity="0.22" />
      <path d="M100 23L78 34L100 45V23Z" fill="#ffffff" opacity="0.22" />
    </svg>
  );
}
