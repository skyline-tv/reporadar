'use client';

import {
  Box,
  Container,
  Flex,
  HStack,
  Button,
  IconButton,
  Text,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerHeader,
  DrawerBody,
  VStack,
  Badge,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { FiHome, FiClock, FiMessageCircle, FiLogOut, FiUser, FiPlus } from 'react-icons/fi';
import { SiGithub } from 'react-icons/si';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: FiHome },
  { href: '/history', label: 'History', icon: FiClock },
  { href: '/chat', label: 'Chat', icon: FiMessageCircle },
];

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(Boolean(localStorage.getItem('token')));
  }, [pathname]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('analyzedRepo');
    localStorage.removeItem('lastAction');
    setAuthed(false);
    router.push('/');
  };

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Button
            key={link.href}
            as={Link}
            href={link.href}
            leftIcon={<link.icon />}
            variant={active ? 'solid' : 'ghost'}
            size="sm"
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
          >
            {link.label}
          </Button>
        );
      })}
    </>
  );

  return (
    <Box
      as="nav"
      borderBottomWidth="1px"
      borderColor="whiteAlpha.200"
      bg="surface.400"
      position="sticky"
      top={0}
      zIndex={20}
      backdropFilter="blur(8px)"
    >
      <Container maxW="container.xl" py={3}>
        <Flex align="center" justify="space-between" gap={3}>
          <HStack spacing={3}>
            <HStack
              as={Link}
              href={authed ? '/dashboard' : '/'}
              spacing={2}
              _hover={{ textDecoration: 'none' }}
            >
              <Box color="brand.400" aria-hidden>
                <SiGithub size={22} />
              </Box>
              <Text fontWeight="700" letterSpacing="-0.02em">
                RepoRadar
              </Text>
              <Badge colorScheme="teal" variant="subtle" display={{ base: 'none', sm: 'inline-flex' }}>
                Beta
              </Badge>
            </HStack>
          </HStack>

          <HStack spacing={2} display={{ base: 'none', md: 'flex' }}>
            {authed ? (
              <>
                <NavLinks />
                <Button
                  as={Link}
                  href="/dashboard"
                  leftIcon={<FiPlus />}
                  size="sm"
                  variant="outline"
                >
                  Analyze
                </Button>
                <Menu>
                  <MenuButton
                    as={IconButton}
                    aria-label="Account menu"
                    icon={<FiUser />}
                    variant="ghost"
                    size="sm"
                  />
                  <MenuList bg="surface.200" borderColor="whiteAlpha.300">
                    <MenuItem
                      icon={<FiHome />}
                      onClick={() => router.push('/dashboard')}
                      bg="transparent"
                      _hover={{ bg: 'whiteAlpha.100' }}
                    >
                      Dashboard
                    </MenuItem>
                    <MenuItem
                      icon={<FiClock />}
                      onClick={() => router.push('/history')}
                      bg="transparent"
                      _hover={{ bg: 'whiteAlpha.100' }}
                    >
                      History
                    </MenuItem>
                    <MenuDivider borderColor="whiteAlpha.200" />
                    <MenuItem
                      icon={<FiLogOut />}
                      onClick={logout}
                      bg="transparent"
                      _hover={{ bg: 'whiteAlpha.100' }}
                      color="red.300"
                    >
                      Log out
                    </MenuItem>
                  </MenuList>
                </Menu>
              </>
            ) : (
              <>
                <Button as={Link} href="/login" size="sm" variant="ghost">
                  Log in
                </Button>
                <Button as={Link} href="/signup" size="sm">
                  Sign up
                </Button>
              </>
            )}
          </HStack>

          <IconButton
            aria-label="Open menu"
            icon={<HamburgerIcon />}
            display={{ base: 'inline-flex', md: 'none' }}
            variant="ghost"
            onClick={onOpen}
          />
        </Flex>
      </Container>

      <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent bg="surface.300" color="white">
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px" borderColor="whiteAlpha.200">
            Menu
          </DrawerHeader>
          <DrawerBody py={6}>
            <VStack align="stretch" spacing={3}>
              {authed ? (
                <>
                  <NavLinks onNavigate={onClose} />
                  <Button as={Link} href="/dashboard" leftIcon={<FiPlus />} onClick={onClose}>
                    Analyze repository
                  </Button>
                  <Button
                    leftIcon={<FiLogOut />}
                    variant="outline"
                    colorScheme="red"
                    onClick={() => {
                      onClose();
                      logout();
                    }}
                  >
                    Log out
                  </Button>
                </>
              ) : (
                <>
                  <Button as={Link} href="/login" onClick={onClose}>
                    Log in
                  </Button>
                  <Button as={Link} href="/signup" variant="outline" onClick={onClose}>
                    Sign up
                  </Button>
                </>
              )}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
}
