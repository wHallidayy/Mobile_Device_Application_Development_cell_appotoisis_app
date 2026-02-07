#!/bin/bash

# สีสำหรับการแสดงผล
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ฟังก์ชันแจ้งเตือน Error และหยุดทำงาน
check_error() {
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: $1 failed. Exiting...${NC}"
        exit 1
    fi
}

echo -e "${YELLOW}--- React Native Build Automation (Robust) ---${NC}"

# ฟังก์ชันสำหรับ Android Build
build_android() {
    # 1. เช็คว่ามีโฟลเดอร์ android ไหม
    if [ ! -d "android" ]; then
        echo -e "${RED}Error: Directory 'android' not found!${NC}"
        
        # เดาว่าอาจจะเป็น Expo
        if [ -f "app.json" ] || grep -q "expo" package.json; then
            echo -e "${YELLOW}Tip: This looks like an Expo project.${NC}"
            echo -e "You might need to run: ${GREEN}npx expo prebuild${NC} to generate native folders."
        fi
        return 1
    fi

    echo -e "${GREEN}Starting Android Build...${NC}"
    
    cd android
    
    # 2. เช็คว่ามี gradlew ไหม
    if [ ! -f "./gradlew" ]; then
         echo -e "${RED}Error: 'gradlew' not found inside android folder.${NC}"
         cd ..
         return 1
    fi

    # ให้สิทธิ์ execute (กันไว้ก่อน)
    chmod +x gradlew

    echo -e "${YELLOW}Cleaning Android project...${NC}"
    ./gradlew clean
    check_error "Gradle Clean"
    
    if [ "$1" == "apk" ]; then
        echo -e "${YELLOW}Building APK (Release)...${NC}"
        ./gradlew assembleRelease
        check_error "Assemble Release"
        
        echo -e "${GREEN}Build Success! APK location:${NC}"
        echo "$(pwd)/app/build/outputs/apk/release/app-release.apk"
    elif [ "$1" == "bundle" ]; then
        echo -e "${YELLOW}Building App Bundle (AAB)...${NC}"
        ./gradlew bundleRelease
        check_error "Bundle Release"
        
        echo -e "${GREEN}Build Success! AAB location:${NC}"
        echo "$(pwd)/app/build/outputs/bundle/release/app-release.aab"
    fi
    
    cd ..
}

# ฟังก์ชันสำหรับ iOS Build
build_ios() {
    if [[ "$OSTYPE" != "darwin"* ]]; then
        echo -e "${RED}Error: iOS build requires macOS.${NC}"
        return 1
    fi
    
    if [ ! -d "ios" ]; then
        echo -e "${RED}Error: Directory 'ios' not found!${NC}"
        if [ -f "app.json" ] || grep -q "expo" package.json; then
             echo -e "${YELLOW}Tip: Run 'npx expo prebuild' first.${NC}"
        fi
        return 1
    fi

    echo -e "${GREEN}Starting iOS Build...${NC}"
    cd ios
    pod install
    check_error "Pod install"
    
    # ส่วน Build command ต้องปรับตาม Scheme จริง
    echo -e "${YELLOW}Please configure Xcode CLI build command in this script manually.${NC}"
    cd ..
}

# เมนูหลัก
echo "Select build type:"
echo "1) Android APK"
echo "2) Android App Bundle"
echo "3) iOS"
echo "4) Generate Native Folders (Expo Prebuild)"
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        build_android "apk"
        ;;
    2)
        build_android "bundle"
        ;;
    3)
        build_ios
        ;;
    4)
        echo -e "${YELLOW}Running Expo Prebuild...${NC}"
        npx expo prebuild
        ;;
    *)
        echo -e "${RED}Invalid option.${NC}"
        ;;
esac