/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

#import "XCUIDevice+FBHelpers.h"

#import <arpa/inet.h>
#import <ifaddrs.h>
#include <notify.h>
#import <objc/runtime.h>

#import "FBSpringboardApplication.h"
#import "FBErrorBuilder.h"
#import "FBMathUtils.h"
#import "FBXCodeCompatibility.h"

#import "FBMacros.h"
#import "XCAXClient_iOS.h"
#import "XCUIScreen.h"

static const NSTimeInterval FBHomeButtonCoolOffTime = 1.;
static const XCUIApplication *app;
static UIInterfaceOrientation lastScreenOrientation;
static CGSize lastScreenSize;
static XCUIScreen *mainScreen;


@implementation XCUIDevice (FBHelpers)

- (BOOL)fb_goToHomescreenWithError:(NSError **)error
{
  [self pressButton:XCUIDeviceButtonHome];
  // This is terrible workaround to the fact that pressButton:XCUIDeviceButtonHome is not a synchronous action.
  // On 9.2 some first queries  will trigger additional "go to home" event
  // So if we don't wait here it will be interpreted as double home button gesture and go to application switcher instead.
  // On 9.3 pressButton:XCUIDeviceButtonHome can be slightly delayed.
  // Causing waitUntilApplicationBoardIsVisible not to work properly in some edge cases e.g. like starting session right after this call, while being on home screen
  [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:FBHomeButtonCoolOffTime]];
  if (![[FBSpringboardApplication fb_springboard] fb_waitUntilApplicationBoardIsVisible:error]) {
    return NO;
  }
  return YES;
}

- (BOOL)fb_doubleTapHomeWithError:(NSError **)error
{
  [self pressButton:XCUIDeviceButtonHome];
  [self pressButton:XCUIDeviceButtonHome];
  return YES;
}

- (void)fb_increaseVolume
{
#if TARGET_IPHONE_SIMULATOR
#else
  [self pressButton:XCUIDeviceButtonVolumeUp];
#endif
}

- (void)fb_decreaseVolume
{
#if TARGET_IPHONE_SIMULATOR
#else
  [self pressButton:XCUIDeviceButtonVolumeDown];
#endif
}

- (NSData *)fb_screenshotWithError:(NSError*__autoreleasing*)error
{

  if(app == nil) {
    app = FBApplication.fb_activeApplication;
  }
  
  if(CGSizeEqualToSize(CGSizeZero, lastScreenSize) || (lastScreenOrientation != app.interfaceOrientation) ) {
    lastScreenOrientation = app.interfaceOrientation;
    lastScreenSize = FBAdjustDimensionsForApplication(app.frame.size, app.interfaceOrientation);
  }
 
  return [self fb_screenshotWithError:error withOrientation:lastScreenOrientation andScreenWidth:lastScreenSize.width andScreenHeight:lastScreenSize.height];
  
  
  // The resulting data is a JPEG image, so we need to convert it to PNG representation

//  UIImage *image = [UIImage imageWithData:result];
//  return (NSData *)UIImagePNGRepresentation(image);

}

- (NSData *)fb_screenshotWithError:(NSError*__autoreleasing*)error withOrientation:(UIInterfaceOrientation) orientation andScreenWidth:(CGFloat) screenWidth andScreenHeight:(CGFloat) screenHeight
{
  Class xcScreenClass = objc_lookUpClass("XCUIScreen");
  if (nil == xcScreenClass) {
    NSData *result = [[XCAXClient_iOS sharedClient] screenshotData];
    if (nil == result) {
      if (error) {
        *error = [[FBErrorBuilder.builder withDescription:@"Cannot take a screenshot of the current screen state"] build];
      }
      return nil;
    }
    return result;
  }

  if(mainScreen == nil) {
    mainScreen = (XCUIScreen *)[xcScreenClass mainScreen];
  }

  CGRect screenRect = CGRectMake(0, 0, screenWidth, screenHeight);
  
  NSUInteger quality = 2;
  NSData *result =   [mainScreen screenshotDataForQuality:quality rect:screenRect error:nil];
  return result;
}

- (BOOL)fb_fingerTouchShouldMatch:(BOOL)shouldMatch
{
  const char *name;
  if (shouldMatch) {
    name = "com.apple.BiometricKit_Sim.fingerTouch.match";
  } else {
    name = "com.apple.BiometricKit_Sim.fingerTouch.nomatch";
  }
  return notify_post(name) == NOTIFY_STATUS_OK;
}

- (NSString *)fb_wifiIPAddress
{
  struct ifaddrs *interfaces = NULL;
  struct ifaddrs *temp_addr = NULL;
  int success = getifaddrs(&interfaces);
  if (success != 0) {
    freeifaddrs(interfaces);
    return nil;
  }

  NSString *address = nil;
  temp_addr = interfaces;
  while(temp_addr != NULL) {
    if(temp_addr->ifa_addr->sa_family != AF_INET) {
      temp_addr = temp_addr->ifa_next;
      continue;
    }
    NSString *interfaceName = [NSString stringWithUTF8String:temp_addr->ifa_name];
    if(![interfaceName containsString:@"en"]) {
      temp_addr = temp_addr->ifa_next;
      continue;
    }
    address = [NSString stringWithUTF8String:inet_ntoa(((struct sockaddr_in *)temp_addr->ifa_addr)->sin_addr)];
    break;
  }
  freeifaddrs(interfaces);
  return address;
}

@end
